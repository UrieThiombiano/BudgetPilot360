/**
 * Composants d'analyse financière partagés — dashboard ET aperçu de rapport
 * (même donnée, même palette par catégorie, même finition).
 *
 * Règles dataviz appliquées : couleur par ENTITÉ (categoryColor, jamais par
 * rang), un seul axe par graphique, légendes toujours accompagnées de libellés
 * (jamais la couleur seule — règle de relief), marques fines à bouts arrondis,
 * grilles discrètes, tooltips habillés à la charte, thème clair/sombre.
 */
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useIsDark } from "../hooks/useTheme";
import { chartColors } from "../lib/chartTheme";
import { categoryColor, OTHERS_COLOR } from "../lib/categoryColors";
import { compactFcfa, fcfa } from "../lib/format";

export interface CategoryBreakdownEntry {
  id: string;
  name: string;
  planned: number;
  amount: number;
  count: number;
}

export const tooltipClass =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-popover";

/* ---------------------------------------------------------------- Donut --- */

const DONUT_MAX_SLICES = 8;

interface DonutSlice {
  id: string;
  name: string;
  amount: number;
  count: number;
  color: string;
}

function buildSlices(rows: CategoryBreakdownEntry[], dark: boolean): DonutSlice[] {
  const withSpend = rows.filter((r) => r.amount > 0);
  const head = withSpend.slice(0, DONUT_MAX_SLICES);
  const tail = withSpend.slice(DONUT_MAX_SLICES);
  const slices: DonutSlice[] = head.map((r) => ({
    id: r.id,
    name: r.name,
    amount: r.amount,
    count: r.count,
    color: categoryColor(r.id, dark),
  }));
  if (tail.length > 0) {
    slices.push({
      id: "__others__",
      name: `Autres (${tail.length})`,
      amount: tail.reduce((s, r) => s + r.amount, 0),
      count: tail.reduce((s, r) => s + r.count, 0),
      color: dark ? OTHERS_COLOR.dark : OTHERS_COLOR.light,
    });
  }
  return slices;
}

function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ payload: DonutSlice }>;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  const pct = total > 0 ? ((s.amount / total) * 100).toFixed(1) : "0";
  return (
    <div className={tooltipClass}>
      <p className="flex items-center gap-1.5 text-xs text-fg-muted">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
        {s.name}
      </p>
      <p className="mt-0.5 font-semibold tnum text-fg">{fcfa(s.amount)}</p>
      <p className="text-xs tnum text-fg-subtle">
        {pct} % du total · {s.count} opération{s.count > 1 ? "s" : ""}
      </p>
    </div>
  );
}

/** Donut « répartition par catégorie » : centre = total de la période,
 * légende riche à côté (nom, montant, %) — la légende EST le relief. */
export function CategoryDonut({
  title,
  subtitle,
  rows,
  emptyText,
  compact = false,
  maxLegendRows,
}: {
  title: string;
  subtitle?: string;
  rows: CategoryBreakdownEntry[];
  emptyText: string;
  /** Version résumé (rapport) : donut plus petit, légende bornée. */
  compact?: boolean;
  maxLegendRows?: number;
}) {
  const dark = useIsDark();
  const c = chartColors(dark);
  const slices = buildSlices(rows, dark);
  const total = slices.reduce((s, r) => s + r.amount, 0);
  const legendRows = maxLegendRows ? slices.slice(0, maxLegendRows) : slices;
  const size = compact ? 130 : 176;

  return (
    <div>
      <h3 className="font-display text-sm font-semibold text-fg">{title}</h3>
      {subtitle && <p className="text-xs text-fg-muted">{subtitle}</p>}
      {total <= 0 ? (
        <p className="mt-6 pb-6 text-center text-sm text-fg-muted">{emptyText}</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-5">
          <div className="relative" style={{ width: size, height: size }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<DonutTooltip total={total} />} />
                <Pie
                  data={slices}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius="68%"
                  outerRadius="100%"
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {slices.map((s) => (
                    <Cell key={s.id} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Centre du donut : total de la période */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className={`font-display font-semibold tracking-tight text-fg ${compact ? "text-sm" : "text-base"}`}>
                {compactFcfa(total)}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-fg-subtle">Total</span>
            </div>
          </div>
          <ul className="min-w-40 flex-1 space-y-1.5">
            {legendRows.map((s) => {
              const pct = ((s.amount / total) * 100).toFixed(1);
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 text-fg-muted">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="shrink-0 tnum text-fg">
                    {fcfa(s.amount)} <span className="text-fg-subtle">· {pct} %</span>
                  </span>
                </li>
              );
            })}
            {maxLegendRows && slices.length > maxLegendRows && (
              <li className="text-xs text-fg-subtle">
                + {slices.length - maxLegendRows} autre(s) catégorie(s) — détail en section 2
              </li>
            )}
          </ul>
        </div>
      )}
      {/* Grille discrète implicite : le donut n'a ni axe ni grille — rien à styler. */}
      <span className="sr-only">{c.surface}</span>
    </div>
  );
}

/* --------------------------------------------------- Budget vs Réalisé --- */

interface BvARow extends CategoryBreakdownEntry {
  over: boolean;
}

function BvATooltip({
  active,
  payload,
  plannedLabel,
  actualLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: BvARow }>;
  plannedLabel: string;
  actualLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const pct = r.planned > 0 ? Math.round((r.amount / r.planned) * 100) : null;
  return (
    <div className={tooltipClass}>
      <p className="text-xs font-medium text-fg">{r.name}</p>
      <p className="text-xs tnum text-fg-muted">{plannedLabel} : {fcfa(r.planned)}</p>
      <p className={`text-xs font-medium tnum ${r.over ? "text-danger-ink" : "text-fg"}`}>
        {actualLabel} : {fcfa(r.amount)}
        {pct !== null && ` (${pct} %)`}
      </p>
      {r.over && <p className="text-xs font-medium text-danger-ink">Dépassement</p>}
    </div>
  );
}

/** Barres horizontales groupées « prévu vs réalisé » par catégorie, triées par
 * réalisé décroissant. Réalisé = couleur de la catégorie (rouge d'alerte en
 * dépassement) ; prévu = barre neutre claire. */
export function BudgetVsActual({
  title,
  subtitle,
  rows,
  kind,
  emptyText,
  maxRows = 8,
}: {
  title: string;
  subtitle?: string;
  rows: CategoryBreakdownEntry[];
  kind: "expense" | "revenue";
  emptyText: string;
  maxRows?: number;
}) {
  const dark = useIsDark();
  const c = chartColors(dark);
  const dangerColor = dark ? "#e66767" : "#d03b3b";
  const plannedFill = dark ? "#353349" : "#e2e2ee";

  const data: BvARow[] = rows
    .filter((r) => r.amount > 0 || r.planned > 0)
    .slice(0, maxRows)
    .map((r) => ({
      ...r,
      // Un OBJECTIF de recette non atteint n'est pas une alerte — seul un
      // budget de dépense crevé l'est.
      over: kind === "expense" && r.planned > 0 && r.amount > r.planned,
    }));
  const plannedLabel = kind === "expense" ? "Budget prévu" : "Objectif";
  const actualLabel = kind === "expense" ? "Consommé" : "Réalisé";

  if (data.length === 0) {
    return (
      <div>
        <h3 className="font-display text-sm font-semibold text-fg">{title}</h3>
        {subtitle && <p className="text-xs text-fg-muted">{subtitle}</p>}
        <p className="mt-6 pb-6 text-center text-sm text-fg-muted">{emptyText}</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="font-display text-sm font-semibold text-fg">{title}</h3>
      {subtitle && <p className="text-xs text-fg-muted">{subtitle}</p>}
      <div className="mt-4" style={{ height: data.length * 52 + 40 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }} barGap={2}>
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
              width={108}
              tick={{ fill: c.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<BvATooltip plannedLabel={plannedLabel} actualLabel={actualLabel} />}
              cursor={{ fill: c.cursor }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(v) => (v === "planned" ? plannedLabel : actualLabel)}
            />
            <Bar dataKey="planned" fill={plannedFill} barSize={10} radius={[0, 3, 3, 0]} />
            <Bar dataKey="amount" barSize={10} radius={[0, 3, 3, 0]}>
              {data.map((r) => (
                <Cell key={r.id} fill={r.over ? dangerColor : categoryColor(r.id, dark)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Waterfall --- */

interface WaterfallDatum {
  name: string;
  base: number;
  value: number;
  display: number;
  fill: string;
}

function WaterfallTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: WaterfallDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className={tooltipClass}>
      <p className="text-xs text-fg-muted">{d.name}</p>
      <p className="font-semibold tnum text-fg">{fcfa(d.display)}</p>
    </div>
  );
}

/** Pont financier Recettes → Dépenses → Bénéfice net : la synthèse du
 * dirigeant pressé. Barres en cascade (base invisible + segment visible). */
export function FinancialWaterfall({
  revenues,
  expenses,
  title = "Pont financier",
  subtitle,
}: {
  revenues: number;
  expenses: number;
  title?: string;
  subtitle?: string;
}) {
  const dark = useIsDark();
  const c = chartColors(dark);
  const net = revenues - expenses;
  const dangerColor = dark ? "#e66767" : "#d03b3b";

  const data: WaterfallDatum[] = [
    { name: "Recettes", base: 0, value: revenues, display: revenues, fill: c.revenue },
    { name: "Dépenses", base: net, value: expenses, display: -expenses, fill: c.expense },
    {
      name: "Bénéfice net",
      base: Math.min(0, net),
      value: Math.abs(net),
      display: net,
      fill: net >= 0 ? c.revenue : dangerColor,
    },
  ];
  const hasData = revenues > 0 || expenses > 0;

  return (
    <div>
      <h3 className="font-display text-sm font-semibold text-fg">{title}</h3>
      {subtitle && <p className="text-xs text-fg-muted">{subtitle}</p>}
      {!hasData ? (
        <p className="mt-6 pb-6 text-center text-sm text-fg-muted">
          Aucune recette ni dépense sur la période.
        </p>
      ) : (
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={c.grid} strokeWidth={1} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: c.muted, fontSize: 11 }} axisLine={{ stroke: c.axisLine, strokeWidth: 1 }} tickLine={false} />
              <YAxis tickFormatter={compactFcfa} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
              <Tooltip content={<WaterfallTooltip />} cursor={{ fill: c.cursor }} />
              {/* Base invisible : positionne le segment en cascade */}
              <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
              <Bar dataKey="value" stackId="wf" barSize={44} radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------- Sparkline & tendance --- */

/** Mini-courbe de tendance pour carte KPI (12 derniers mois). */
export function KpiSparkline({ points, color }: { points: number[]; color: string }) {
  const data = points.map((v, i) => ({ i, v }));
  if (points.every((v) => v === 0)) return null;
  return (
    <div className="mt-2 h-8" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.12} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Delta vs période précédente. La SÉMANTIQUE prime sur la direction :
 * une hausse de dépenses est défavorable même si la flèche monte. */
export function DeltaBadge({
  current,
  previous,
  favorableWhenUp,
  label,
}: {
  current: number;
  previous: number;
  favorableWhenUp: boolean;
  label: string;
}) {
  if (previous === 0) {
    return current === 0 ? null : (
      <span className="mt-1 inline-flex items-center gap-1 text-xs text-fg-subtle">
        <Minus size={12} strokeWidth={2} /> {label} : nouveau
      </span>
    );
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.05) return null;
  const up = pct > 0;
  const favorable = up === favorableWhenUp;
  const tone = favorable ? "text-success-ink" : "text-danger-ink";
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${tone}`}>
      <Arrow size={13} strokeWidth={2.25} />
      <span className="tnum">{pct > 0 ? "+" : ""}{pct.toFixed(0)} %</span>
      <span className="font-normal text-fg-subtle">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------ Filtre période --- */

export type Period = "month" | "year";

export function PeriodToggle({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  const options: Array<{ key: Period; label: string }> = [
    { key: "month", label: "Mois en cours" },
    { key: "year", label: "Année en cours" },
  ];
  return (
    <div role="tablist" aria-label="Période d'analyse" className="inline-flex gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <motion.button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          whileTap={{ scale: 0.97 }}
          onClick={() => onChange(o.key)}
          className={[
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.key ? "bg-accent text-accent-fg shadow-card" : "text-fg-muted hover:text-fg",
          ].join(" ")}
        >
          {o.label}
        </motion.button>
      ))}
    </div>
  );
}

/* --------------------------------------- Recettes vs Dépenses en aires --- */

export interface ComparisonPoint {
  month: string;
  revenues: number;
  expenses: number;
  net: number;
}

/** Zone chart recettes/dépenses (aires semi-transparentes = l'écart se VOIT)
 * + ligne de bénéfice net avec dégradé vert→rouge selon le signe. */
export function RevenueExpenseArea({
  data,
  monthTick,
  tooltip,
}: {
  data: ComparisonPoint[];
  monthTick: (m: string) => string;
  tooltip: React.ReactElement;
}) {
  const dark = useIsDark();
  const c = chartColors(dark);
  const dangerColor = dark ? "#e66767" : "#d03b3b";

  // Position du zéro dans le gradient du net (0 = haut du tracé, 1 = bas).
  const nets = data.map((p) => p.net);
  const maxNet = Math.max(...nets, 0);
  const minNet = Math.min(...nets, 0);
  const zeroOffset = maxNet <= 0 ? 0 : minNet >= 0 ? 1 : maxNet / (maxNet - minNet);

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="areaRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.revenue} stopOpacity={0.28} />
              <stop offset="100%" stopColor={c.revenue} stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="areaExpense" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.expense} stopOpacity={0.24} />
              <stop offset="100%" stopColor={c.expense} stopOpacity={0.03} />
            </linearGradient>
            {/* Le dégradé du net bascule vert → rouge au passage du zéro */}
            <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.revenue} stopOpacity={0.22} />
              <stop offset={`${zeroOffset * 100}%`} stopColor={c.revenue} stopOpacity={0.04} />
              <stop offset={`${zeroOffset * 100}%`} stopColor={dangerColor} stopOpacity={0.04} />
              <stop offset="100%" stopColor={dangerColor} stopOpacity={0.22} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} strokeWidth={1} vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthTick} tick={{ fill: c.muted, fontSize: 11 }} axisLine={{ stroke: c.axisLine, strokeWidth: 1 }} tickLine={false} minTickGap={16} />
          <YAxis tickFormatter={compactFcfa} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
          <Tooltip content={tooltip} cursor={{ stroke: c.axisLine, strokeWidth: 1 }} />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(v) => (v === "revenues" ? "Recettes" : v === "expenses" ? "Dépenses" : "Bénéfice net")}
          />
          <Area type="monotone" dataKey="revenues" stroke={c.revenue} strokeWidth={2} fill="url(#areaRevenue)" />
          <Area type="monotone" dataKey="expenses" stroke={c.expense} strokeWidth={2} fill="url(#areaExpense)" />
          <Area type="monotone" dataKey="net" stroke="none" fill="url(#netFill)" legendType="none" tooltipType="none" />
          <Line type="monotone" dataKey="net" stroke={c.net} strokeWidth={2} dot={{ r: 3, fill: c.net, stroke: c.surface, strokeWidth: 1 }} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
