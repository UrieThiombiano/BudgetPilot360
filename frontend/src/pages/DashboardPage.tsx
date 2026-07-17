import { motion, type Variants } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useIsDark } from "../hooks/useTheme";
import { CardSkeleton, ErrorBanner, Skeleton } from "../components/ui";
import { compactFcfa, fcfa } from "../lib/format";

interface MonthlyPoint {
  month: string; // "AAAA-MM"
  total: number;
  count: number;
}

interface TopCategory {
  id: string;
  name: string;
  planned_budget: number;
  consumed: number;
}

interface DashboardSummary {
  company_name: string;
  annual_budget: number;
  consumed: number;
  remaining: number;
  month_total: number;
  expenses_count: number;
  pending_count: number;
  pending_amount: number;
  rejected_count: number;
  monthly_trend: MonthlyPoint[];
  top_categories: TopCategory[];
}

interface MyExpense {
  id: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
}


const monthTick = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "short" });
};

const monthFull = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
};

/* Couleurs des graphiques — série unique dans l'accent indigo de l'app,
   chrome (grille/axes) en hairlines slate recessives, adapté au mode sombre.
   Le texte reste en encre neutre : la couleur ne porte que les marques. */
function chartColors(dark: boolean) {
  return dark
    ? {
        series: "#6366f1", // indigo-500 — validé sur surface sombre (bande L 0.48–0.67)
        grid: "#1e293b", // slate-800, hairline
        axisLine: "#334155",
        muted: "#94a3b8",
        surface: "#020617", // slate-950, la carte : anneau des points
        cursor: "rgba(148, 163, 184, 0.12)",
      }
    : {
        series: "#4f46e5", // indigo-600
        grid: "#e2e8f0", // slate-200, hairline
        axisLine: "#cbd5e1",
        muted: "#64748b",
        surface: "#ffffff",
        cursor: "rgba(100, 116, 139, 0.08)",
      };
}

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

const cardClass =
  "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950";

function StatCard({
  label,
  value,
  hint,
  hintTone = "muted",
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  hintTone?: "muted" | "danger" | "warning";
  children?: React.ReactNode;
}) {
  const hintClass =
    hintTone === "danger"
      ? "text-red-600 dark:text-red-400"
      : hintTone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-slate-500 dark:text-slate-400";
  return (
    <motion.div variants={itemVariants} className={cardClass}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
      {hint && <p className={`mt-1 text-xs ${hintClass}`}>{hint}</p>}
      {children}
    </motion.div>
  );
}

/** Jauge budget : piste = pas clair de la même gamme indigo (jamais un gris neutre). */
function BudgetMeter({ ratio }: { ratio: number }) {
  const pct = Math.min(Math.max(ratio, 0) * 100, 100);
  const fill =
    ratio > 1 ? "bg-red-500" : ratio >= 0.85 ? "bg-amber-500" : "bg-indigo-600 dark:bg-indigo-400";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Consommation du budget annuel"
      className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-950"
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* --- Tooltips : la valeur en premier et en fort, le libellé en secondaire --- */

const tooltipClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900";

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: MonthlyPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className={tooltipClass}>
      <p className="font-semibold text-slate-900 dark:text-white">{fcfa(point.total)}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {monthFull(point.month)} · {point.count} dépense{point.count > 1 ? "s" : ""} approuvée
        {point.count > 1 ? "s" : ""}
      </p>
    </div>
  );
}

function CategoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TopCategory }>;
}) {
  if (!active || !payload?.length) return null;
  const cat = payload[0].payload;
  return (
    <div className={tooltipClass}>
      <p className="font-semibold text-slate-900 dark:text-white">{fcfa(cat.consumed)}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {cat.name} · budget prévu {fcfa(cat.planned_budget)}
      </p>
    </div>
  );
}

/* ------------------------- Dashboard admin ------------------------- */

function AdminDashboard() {
  const dark = useIsDark();
  const c = chartColors(dark);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get<DashboardSummary>("/dashboard/summary")).data,
  });

  if (isLoading) {
    return (
      <div aria-busy="true">
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} lines={1} />
          ))}
        </div>
        <div className={`${cardClass} mt-4`}>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-4 h-64 w-full" />
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <ErrorBanner className="mt-6">
        Impossible de charger le dashboard. Vérifiez votre connexion puis réessayez.
      </ErrorBanner>
    );
  }

  const ratio = data.annual_budget > 0 ? data.consumed / data.annual_budget : 0;
  const hasTrend = data.monthly_trend.some((p) => p.count > 0);
  const topWithSpend = data.top_categories.filter((cat) => cat.consumed > 0);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show">
      {/* KPI — budget */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Budget annuel" value={fcfa(data.annual_budget)} />
        <StatCard
          label={`Consommé en ${new Date().getFullYear()}`}
          value={fcfa(data.consumed)}
          hint={
            data.annual_budget > 0
              ? `${Math.round(ratio * 100)} % du budget annuel`
              : "Aucun budget annuel défini"
          }
        >
          {data.annual_budget > 0 && <BudgetMeter ratio={ratio} />}
        </StatCard>
        <StatCard
          label="Restant"
          value={fcfa(data.remaining)}
          hint={data.remaining < 0 ? "Budget annuel dépassé" : undefined}
          hintTone="danger"
        />
        <StatCard label="Dépensé ce mois-ci" value={fcfa(data.month_total)} />
      </div>

      {/* KPI — activité */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Dépenses cette année"
          value={String(data.expenses_count)}
          hint="tous statuts confondus"
        />
        <StatCard
          label="En attente d'approbation"
          value={String(data.pending_count)}
          hint={data.pending_count > 0 ? `${fcfa(data.pending_amount)} à arbitrer` : "Rien à traiter"}
          hintTone={data.pending_count > 0 ? "warning" : "muted"}
        />
        <StatCard label="Rejetées cette année" value={String(data.rejected_count)} />
      </div>

      {/* Graphiques */}
      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <motion.section variants={itemVariants} className={`${cardClass} xl:col-span-3`}>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Évolution mensuelle
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Dépenses approuvées, 12 derniers mois
          </p>
          {hasTrend ? (
            <>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.monthly_trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={c.grid} strokeWidth={1} vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickFormatter={monthTick}
                      tick={{ fill: c.muted, fontSize: 11 }}
                      axisLine={{ stroke: c.axisLine, strokeWidth: 1 }}
                      tickLine={false}
                      minTickGap={16}
                    />
                    <YAxis
                      tickFormatter={compactFcfa}
                      tick={{ fill: c.muted, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={64}
                    />
                    <Tooltip
                      content={<TrendTooltip />}
                      cursor={{ stroke: c.axisLine, strokeWidth: 1 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke={c.series}
                      strokeWidth={2}
                      dot={{ r: 4, fill: c.series, stroke: c.surface, strokeWidth: 2 }}
                      activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* Équivalent tableau : chaque valeur reste lisible sans survol */}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                  Voir les données en tableau
                </summary>
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 dark:text-slate-400">
                      <th className="py-1 font-medium">Mois</th>
                      <th className="py-1 text-right font-medium">Montant approuvé</th>
                      <th className="py-1 text-right font-medium">Nb</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700 dark:text-slate-300 [font-variant-numeric:tabular-nums]">
                    {data.monthly_trend.map((p) => (
                      <tr key={p.month} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1">{monthFull(p.month)}</td>
                        <td className="py-1 text-right">{fcfa(p.total)}</td>
                        <td className="py-1 text-right">{p.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <p className="mt-8 pb-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Aucune dépense approuvée sur les 12 derniers mois.
            </p>
          )}
        </motion.section>

        <motion.section variants={itemVariants} className={`${cardClass} xl:col-span-2`}>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Catégories les plus coûteuses
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Dépenses approuvées, année en cours
          </p>
          {topWithSpend.length > 0 ? (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topWithSpend}
                  layout="vertical"
                  margin={{ top: 8, right: 48, bottom: 0, left: 0 }}
                >
                  <CartesianGrid stroke={c.grid} strokeWidth={1} horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={compactFcfa}
                    tick={{ fill: c.muted, fontSize: 11 }}
                    axisLine={{ stroke: c.axisLine, strokeWidth: 1 }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={104}
                    tick={{ fill: c.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CategoryTooltip />} cursor={{ fill: c.cursor }} />
                  {/* Nominal → une seule teinte pour toutes les barres, extrémité arrondie côté données */}
                  <Bar dataKey="consumed" fill={c.series} barSize={18} radius={[0, 4, 4, 0]}>
                    <LabelList
                      dataKey="consumed"
                      position="right"
                      formatter={(v: number) => compactFcfa(v)}
                      fill={c.muted}
                      fontSize={11}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-8 pb-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Aucune dépense approuvée cette année pour l'instant.
            </p>
          )}
        </motion.section>
      </div>
    </motion.div>
  );
}

/* --------------------- Dashboard personnel (rôle user) --------------------- */
/* Un `user` ne voit que ses propres dépenses (RBAC CLAUDE.md) : son dashboard
   se dérive de /expenses/mine, sans exposer les données de l'entreprise. */

function UserDashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-expenses"],
    queryFn: async () => (await api.get<MyExpense[]>("/expenses/mine")).data,
  });

  if (isLoading) {
    return (
      <div aria-busy="true" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorBanner className="mt-6">
        Impossible de charger vos dépenses. Vérifiez votre connexion puis réessayez.
      </ErrorBanner>
    );
  }

  const expenses = data ?? [];
  const sum = (status: MyExpense["status"]) =>
    expenses
      .filter((e) => e.status === status)
      .reduce((total, e) => total + Number(e.amount), 0);
  const count = (status: MyExpense["status"]) =>
    expenses.filter((e) => e.status === status).length;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <StatCard label="Mes dépenses" value={String(expenses.length)} hint="toutes soumissions" />
      <StatCard label="Approuvées" value={fcfa(sum("approved"))} hint={`${count("approved")} dépense(s)`} />
      <StatCard
        label="En attente"
        value={fcfa(sum("pending"))}
        hint={`${count("pending")} dépense(s)`}
        hintTone={count("pending") > 0 ? "warning" : "muted"}
      />
      <StatCard label="Rejetées" value={String(count("rejected"))} />
    </motion.div>
  );
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Dashboard</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {isAdmin
          ? "Vue d'ensemble budgétaire de votre entreprise."
          : "Vue d'ensemble de vos dépenses."}
      </p>
      {isAdmin ? <AdminDashboard /> : <UserDashboard />}
    </div>
  );
}
