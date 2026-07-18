import { motion, type Variants } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  Percent,
  PiggyBank,
  Receipt,
  Scale,
  TrendingUp,
  Wallet,
  type LucideProps,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ComponentType } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useIsDark } from "../hooks/useTheme";
import { chartColors } from "../lib/chartTheme";
import { CardSkeleton, ErrorBanner, Skeleton } from "../components/ui";
import { compactFcfa, fcfa } from "../lib/format";

interface ComparisonPoint {
  month: string;
  revenues: number;
  expenses: number;
  net: number;
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
  revenue_month: number;
  revenue_year: number;
  net_profit: number;
  margin: number | null;
  revenue_pending_count: number;
  comparison: ComparisonPoint[];
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

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

function StatCard({
  label,
  value,
  hint,
  hintTone = "muted",
  valueTone = "default",
  icon: Icon,
  iconTone = "accent",
  emphasize = false,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  hintTone?: "muted" | "danger" | "warning";
  valueTone?: "default" | "positive" | "negative";
  icon?: ComponentType<LucideProps>;
  iconTone?: "accent" | "positive" | "negative";
  emphasize?: boolean;
  children?: React.ReactNode;
}) {
  const hintClass =
    hintTone === "danger" ? "text-danger-ink" : hintTone === "warning" ? "text-warning-ink" : "text-fg-subtle";
  const valueClass =
    valueTone === "positive" ? "text-success-ink" : valueTone === "negative" ? "text-danger-ink" : "text-fg";
  const iconWrap =
    iconTone === "positive"
      ? "bg-success-soft text-success-ink"
      : iconTone === "negative"
        ? "bg-danger-soft text-danger-ink"
        : "bg-accent-soft text-accent-ink";
  return (
    <motion.div
      variants={item}
      className={`card p-5 transition-shadow hover:shadow-elevated ${
        emphasize ? "ring-1 ring-inset ring-accent/25" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</p>
        {Icon && (
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconWrap}`}>
            <Icon size={16} strokeWidth={2} />
          </span>
        )}
      </div>
      <p className={`mt-2.5 font-display text-2xl font-semibold tracking-tight tnum ${valueClass}`}>{value}</p>
      {hint && <p className={`mt-1 text-xs ${hintClass}`}>{hint}</p>}
      {children}
    </motion.div>
  );
}

function BudgetMeter({ ratio }: { ratio: number }) {
  const pct = Math.min(Math.max(ratio, 0) * 100, 100);
  const fill = ratio > 1 ? "bg-danger" : ratio >= 0.85 ? "bg-warning" : "bg-accent";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Consommation du budget annuel"
      className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <motion.div
        className={`h-full rounded-full ${fill}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
    </div>
  );
}

const tooltipClass = "rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-popover";

function CategoryTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TopCategory }> }) {
  if (!active || !payload?.length) return null;
  const cat = payload[0].payload;
  return (
    <div className={tooltipClass}>
      <p className="font-semibold tnum text-fg">{fcfa(cat.consumed)}</p>
      <p className="text-xs text-fg-muted">{cat.name} · budget prévu {fcfa(cat.planned_budget)}</p>
    </div>
  );
}

function ComparisonTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ComparisonPoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const netClass = p.net >= 0 ? "text-success-ink" : "text-danger-ink";
  return (
    <div className={tooltipClass}>
      <p className="font-semibold text-fg">{monthFull(p.month)}</p>
      <p className="text-xs tnum text-success-ink">Recettes&nbsp;: {fcfa(p.revenues)}</p>
      <p className="text-xs tnum text-accent-ink">Dépenses&nbsp;: {fcfa(p.expenses)}</p>
      <p className={`text-xs font-medium tnum ${netClass}`}>Bénéfice net&nbsp;: {fcfa(p.net)}</p>
    </div>
  );
}

const chartCard = "card p-5";

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
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} lines={1} />)}
        </div>
        <div className={`${chartCard} mt-4`}>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-4 h-64 w-full" />
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <ErrorBanner className="mt-6">
        Impossible d'afficher votre tableau de bord. Réessayez dans un instant.
      </ErrorBanner>
    );
  }

  const ratio = data.annual_budget > 0 ? data.consumed / data.annual_budget : 0;
  const hasComparison = data.comparison.some((p) => p.revenues > 0 || p.expenses > 0);
  const topWithSpend = data.top_categories.filter((cat) => cat.consumed > 0);
  const year = new Date().getFullYear();

  return (
    <motion.div variants={container} initial="hidden" animate="show">
      {/* Ligne budget */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Budget annuel" value={fcfa(data.annual_budget)} icon={Wallet} />
        <StatCard
          label={`Dépensé en ${year}`}
          value={fcfa(data.consumed)}
          icon={Receipt}
          hint={data.annual_budget > 0 ? `${Math.round(ratio * 100)} % du budget annuel` : "Définissez un budget annuel pour suivre la consommation"}
        >
          {data.annual_budget > 0 && <BudgetMeter ratio={ratio} />}
        </StatCard>
        <StatCard
          label="Reste à dépenser"
          value={fcfa(data.remaining)}
          icon={PiggyBank}
          hint={data.remaining < 0 ? "Budget annuel dépassé" : undefined}
          hintTone="danger"
        />
        <StatCard label="Dépensé ce mois-ci" value={fcfa(data.month_total)} icon={Clock3} />
      </div>

      {/* Ligne recettes & bénéfice — l'info clé du dirigeant */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Recettes en ${year}`}
          value={fcfa(data.revenue_year)}
          valueTone="positive"
          icon={TrendingUp}
          iconTone="positive"
          hint={data.revenue_pending_count > 0 ? `${data.revenue_pending_count} en cours` : "confirmées"}
        />
        <StatCard
          label="Recettes ce mois-ci"
          value={fcfa(data.revenue_month)}
          valueTone="positive"
          icon={ArrowUpRight}
          iconTone="positive"
        />
        <StatCard
          label={`Bénéfice net ${year}`}
          value={fcfa(data.net_profit)}
          valueTone={data.net_profit >= 0 ? "positive" : "negative"}
          icon={data.net_profit >= 0 ? ArrowUpRight : ArrowDownRight}
          iconTone={data.net_profit >= 0 ? "positive" : "negative"}
          emphasize
          hint={data.net_profit >= 0 ? "vos recettes couvrent vos dépenses" : "vos dépenses dépassent vos recettes"}
          hintTone={data.net_profit >= 0 ? "muted" : "danger"}
        />
        <StatCard
          label="Marge nette"
          value={data.margin !== null ? `${data.margin} %` : "—"}
          valueTone={data.margin === null ? "default" : data.margin >= 0 ? "positive" : "negative"}
          icon={Percent}
          iconTone={data.margin !== null && data.margin < 0 ? "negative" : "positive"}
          hint={data.margin !== null ? "bénéfice ÷ recettes" : "aucune recette confirmée"}
        />
      </div>

      {/* Ligne activité */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Dépenses cette année" value={String(data.expenses_count)} icon={Receipt} hint="toutes dépenses confondues" />
        <StatCard
          label="À valider"
          value={String(data.pending_count)}
          icon={Scale}
          hint={data.pending_count > 0 ? `${fcfa(data.pending_amount)} en attente` : "aucune validation en attente"}
          hintTone={data.pending_count > 0 ? "warning" : "muted"}
          iconTone={data.pending_count > 0 ? "negative" : "accent"}
        />
        <StatCard label="Refusées cette année" value={String(data.rejected_count)} icon={ArrowDownRight} />
      </div>

      {/* Graphiques */}
      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <motion.section variants={item} className={`${chartCard} xl:col-span-3`}>
          <h2 className="font-display text-sm font-semibold text-fg">Recettes vs Dépenses</h2>
          <p className="text-xs text-fg-muted">12 derniers mois — recettes confirmées, dépenses approuvées, bénéfice net</p>
          {hasComparison ? (
            <>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.comparison} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={c.grid} strokeWidth={1} vertical={false} />
                    <XAxis dataKey="month" tickFormatter={monthTick} tick={{ fill: c.muted, fontSize: 11 }} axisLine={{ stroke: c.axisLine, strokeWidth: 1 }} tickLine={false} minTickGap={16} />
                    <YAxis tickFormatter={compactFcfa} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
                    <Tooltip content={<ComparisonTooltip />} cursor={{ fill: c.cursor }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "revenues" ? "Recettes" : v === "expenses" ? "Dépenses" : "Bénéfice net")} />
                    <Bar dataKey="revenues" fill={c.revenue} barSize={12} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="expenses" fill={c.expense} barSize={12} radius={[3, 3, 0, 0]} />
                    <Line type="monotone" dataKey="net" stroke={c.net} strokeWidth={2} dot={{ r: 3, fill: c.net, stroke: c.surface, strokeWidth: 1 }} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-fg-muted hover:text-fg">Voir les données en tableau</summary>
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="text-left text-fg-subtle">
                      <th className="py-1 font-medium">Mois</th>
                      <th className="py-1 text-right font-medium">Recettes</th>
                      <th className="py-1 text-right font-medium">Dépenses</th>
                      <th className="py-1 text-right font-medium">Bénéfice</th>
                    </tr>
                  </thead>
                  <tbody className="tnum text-fg-muted">
                    {data.comparison.map((p) => (
                      <tr key={p.month} className="border-t border-line">
                        <td className="py-1">{monthFull(p.month)}</td>
                        <td className="py-1 text-right">{fcfa(p.revenues)}</td>
                        <td className="py-1 text-right">{fcfa(p.expenses)}</td>
                        <td className={`py-1 text-right ${p.net >= 0 ? "text-success-ink" : "text-danger-ink"}`}>{fcfa(p.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <p className="mt-8 pb-8 text-center text-sm text-fg-muted">
              Aucune recette ni dépense approuvée sur les 12 derniers mois.
            </p>
          )}
        </motion.section>

        <motion.section variants={item} className={`${chartCard} xl:col-span-2`}>
          <h2 className="font-display text-sm font-semibold text-fg">Postes de dépense les plus lourds</h2>
          <p className="text-xs text-fg-muted">Dépenses approuvées, année en cours</p>
          {topWithSpend.length > 0 ? (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topWithSpend} layout="vertical" margin={{ top: 8, right: 48, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={c.grid} strokeWidth={1} horizontal={false} />
                  <XAxis type="number" tickFormatter={compactFcfa} tick={{ fill: c.muted, fontSize: 11 }} axisLine={{ stroke: c.axisLine, strokeWidth: 1 }} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={104} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CategoryTooltip />} cursor={{ fill: c.cursor }} />
                  <Bar dataKey="consumed" fill={c.expense} barSize={18} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="consumed" position="right" formatter={(v: number) => compactFcfa(v)} fill={c.muted} fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-8 pb-8 text-center text-sm text-fg-muted">Aucune dépense approuvée cette année pour l'instant.</p>
          )}
        </motion.section>
      </div>
    </motion.div>
  );
}

function UserDashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-expenses"],
    queryFn: async () => (await api.get<MyExpense[]>("/expenses/mine")).data,
  });

  if (isLoading) {
    return (
      <div aria-busy="true" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    );
  }
  if (isError) {
    return <ErrorBanner className="mt-6">Impossible d'afficher vos dépenses. Réessayez dans un instant.</ErrorBanner>;
  }

  const expenses = data ?? [];
  const sum = (status: MyExpense["status"]) =>
    expenses.filter((e) => e.status === status).reduce((t, e) => t + Number(e.amount), 0);
  const count = (status: MyExpense["status"]) => expenses.filter((e) => e.status === status).length;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Mes dépenses" value={String(expenses.length)} icon={Receipt} hint="toutes soumissions" />
      <StatCard label="Approuvées" value={fcfa(sum("approved"))} icon={ArrowUpRight} iconTone="positive" hint={`${count("approved")} dépense${count("approved") > 1 ? "s" : ""}`} />
      <StatCard label="En validation" value={fcfa(sum("pending"))} icon={Clock3} hint={`${count("pending")} en attente`} hintTone={count("pending") > 0 ? "warning" : "muted"} />
      <StatCard label="Refusées" value={String(count("rejected"))} icon={ArrowDownRight} />
    </motion.div>
  );
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Tableau de bord</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        {isAdmin ? "L'essentiel de vos finances, en un coup d'œil." : "Le suivi de vos dépenses, en un coup d'œil."}
      </p>
      {isAdmin ? <AdminDashboard /> : <UserDashboard />}
    </div>
  );
}
