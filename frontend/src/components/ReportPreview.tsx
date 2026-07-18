/**
 * Aperçu du rapport — flux « Générer → Prévisualiser → Décider ».
 *
 * Restitue fidèlement le rapport final à partir du MÊME payload JSON que le
 * PDF/Excel (GET /reports/data — source unique, zéro divergence), avec les
 * mêmes composants graphiques que le dashboard (même palette par catégorie).
 * Section 1 : bilan résumé (l'essentiel sur un écran). Section 2 : détail.
 * Le sélecteur « Résumé seul » pilote À LA FOIS l'aperçu et le téléchargement.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileSpreadsheet, FileText, Printer, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  BudgetVsActual,
  CategoryDonut,
  FinancialWaterfall,
  RevenueExpenseArea,
  tooltipClass,
  type CategoryBreakdownEntry,
} from "./analytics";
import { ErrorBanner } from "./ui";
import { fcfa } from "../lib/format";

export interface ReportRow {
  date: string;
  category_name: string;
  author_name: string;
  description: string;
  amount: number;
  status: "approved" | "pending" | "rejected";
  status_label: string;
  source?: string;
}
export interface ReportBreakdownRow {
  id: string;
  name: string;
  planned_budget: number;
  consumed: number;
  count: number;
  ratio: number | null;
}
export interface ReportData {
  company_name: string;
  annual_budget: number;
  date_from: string;
  date_to: string;
  generated_on: string;
  total_approved: number;
  total_pending: number;
  total_rejected: number;
  count_approved: number;
  count_pending: number;
  count_rejected: number;
  expenses: ReportRow[];
  breakdown: ReportBreakdownRow[];
  total_revenue: number;
  total_revenue_pending: number;
  count_revenue_approved: number;
  revenues: ReportRow[];
  revenue_breakdown: ReportBreakdownRow[];
  net_profit: number;
  margin: number | null;
  monthly: Array<{ month: string; revenues: number; expenses: number; net: number }>;
}

type Scope = "full" | "summary";

const frDate = (iso: string) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const monthTick = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "short" });
};

const toChartRows = (rows: ReportBreakdownRow[]): CategoryBreakdownEntry[] =>
  rows.map((r) => ({ id: r.id, name: r.name, planned: r.planned_budget, amount: r.consumed, count: r.count }));

function MonthlyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { month: string; revenues: number; expenses: number; net: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className={tooltipClass}>
      <p className="text-xs font-medium text-fg">{p.month}</p>
      <p className="text-xs tnum text-success-ink">Recettes : {fcfa(p.revenues)}</p>
      <p className="text-xs tnum text-accent-ink">Dépenses : {fcfa(p.expenses)}</p>
      <p className={`text-xs font-medium tnum ${p.net >= 0 ? "text-success-ink" : "text-danger-ink"}`}>
        Net : {fcfa(p.net)}
      </p>
    </div>
  );
}

const statusChip: Record<ReportRow["status"], string> = {
  approved: "bg-success-soft text-success-ink",
  pending: "bg-warning-soft text-warning-ink",
  rejected: "bg-danger-soft text-danger-ink",
};

function DetailTable({ rows, withSource, empty }: { rows: ReportRow[]; withSource: boolean; empty: string }) {
  if (rows.length === 0) return <p className="mt-3 text-sm text-fg-muted">{empty}</p>;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead>
          <tr className="text-left uppercase tracking-wide text-fg-subtle">
            <th className="pb-2 font-medium">Date</th>
            <th className="pb-2 font-medium">Catégorie</th>
            <th className="pb-2 font-medium">Auteur</th>
            {withSource && <th className="pb-2 font-medium">Source</th>}
            <th className="pb-2 font-medium">Description</th>
            <th className="pb-2 text-right font-medium">Montant</th>
            <th className="pb-2 font-medium">Statut</th>
          </tr>
        </thead>
        <tbody className="text-fg-muted">
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              <td className="py-1.5">{frDate(r.date)}</td>
              <td className="py-1.5">{r.category_name}</td>
              <td className="py-1.5">{r.author_name}</td>
              {withSource && <td className="py-1.5">{r.source || "—"}</td>}
              <td className="max-w-56 truncate py-1.5">{r.description || "—"}</td>
              <td className="py-1.5 text-right tnum text-fg">{fcfa(r.amount)}</td>
              <td className="py-1.5">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusChip[r.status]}`}>
                  {r.status_label}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BreakdownTable({ rows, plannedLabel, actualLabel }: { rows: ReportBreakdownRow[]; plannedLabel: string; actualLabel: string }) {
  if (rows.length === 0) return <p className="mt-3 text-sm text-fg-muted">Aucune catégorie.</p>;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[480px] text-xs">
        <thead>
          <tr className="text-left uppercase tracking-wide text-fg-subtle">
            <th className="pb-2 font-medium">Catégorie</th>
            <th className="pb-2 text-right font-medium">{plannedLabel}</th>
            <th className="pb-2 text-right font-medium">{actualLabel}</th>
            <th className="pb-2 text-right font-medium">%</th>
          </tr>
        </thead>
        <tbody className="text-fg-muted">
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className="py-1.5">{r.name}</td>
              <td className="py-1.5 text-right tnum">{fcfa(r.planned_budget)}</td>
              <td className="py-1.5 text-right tnum text-fg">{fcfa(r.consumed)}</td>
              <td className={`py-1.5 text-right tnum ${r.ratio !== null && r.ratio > 1 ? "font-semibold text-danger-ink" : ""}`}>
                {r.ratio !== null ? `${Math.round(r.ratio * 100)} %` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Hero({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  const cls = tone === "positive" ? "text-success-ink" : tone === "negative" ? "text-danger-ink" : "text-fg";
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className={`mt-1 font-display text-xl font-bold tracking-tight tnum ${cls}`}>{value}</p>
    </div>
  );
}

export default function ReportPreview({
  data,
  onClose,
  onDownloadError,
}: {
  data: ReportData;
  onClose: () => void;
  onDownloadError: (message: string) => void;
}) {
  const [scope, setScope] = useState<Scope>("full");
  const [error, setError] = useState<string | null>(null);

  // Échap ferme, et le fond ne défile plus tant que l'aperçu est ouvert.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const download = useMutation({
    mutationFn: async (format: "pdf" | "excel") => {
      const resp = await api.get("/reports/export", {
        params: { format, date_from: data.date_from, date_to: data.date_to, scope },
        responseType: "blob",
      });
      const ext = format === "pdf" ? "pdf" : "xlsx";
      const suffix = scope === "summary" ? "_resume" : "";
      const url = URL.createObjectURL(resp.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rapport_budgetpilot360_${data.date_from}_${data.date_to}${suffix}.${ext}`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onMutate: () => setError(null),
    onError: () => {
      const msg = "Téléchargement impossible. Réessayez dans un instant.";
      setError(msg);
      onDownloadError(msg);
    },
  });

  const margin = data.margin !== null ? `${Math.round(data.margin)} %` : "—";
  const netTone = data.net_profit >= 0 ? "positive" : "negative";
  const hasMonthly = data.monthly.length >= 2 && data.monthly.some((p) => p.revenues > 0 || p.expenses > 0);

  return (
    <div role="dialog" aria-modal="true" aria-label="Aperçu du rapport" className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur-sm">
      {/* Barre d'actions — jamais imprimée */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <div>
          <p className="font-display text-sm font-semibold text-fg">Aperçu du rapport</p>
          <p className="text-xs text-fg-muted">Du {frDate(data.date_from)} au {frDate(data.date_to)} — rien n'est téléchargé tant que vous ne le décidez pas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={scope === "summary"}
              onChange={(e) => setScope(e.target.checked ? "summary" : "full")}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            Résumé seul
          </label>
          <motion.button type="button" whileTap={{ scale: 0.97 }} disabled={download.isPending} onClick={() => download.mutate("pdf")} className="btn btn-primary px-3 py-1.5 text-xs">
            <FileText size={14} strokeWidth={2} /> {download.isPending && download.variables === "pdf" ? "…" : "Télécharger le PDF"}
          </motion.button>
          <motion.button type="button" whileTap={{ scale: 0.97 }} disabled={download.isPending} onClick={() => download.mutate("excel")} className="btn btn-ghost px-3 py-1.5 text-xs">
            <FileSpreadsheet size={14} strokeWidth={2} /> {download.isPending && download.variables === "excel" ? "…" : "Télécharger l'Excel"}
          </motion.button>
          <button type="button" onClick={() => window.print()} className="btn btn-ghost px-3 py-1.5 text-xs">
            <Printer size={14} strokeWidth={2} /> Imprimer
          </button>
          <button type="button" onClick={onClose} aria-label="Fermer l'aperçu" className="btn btn-ghost px-3 py-1.5 text-xs">
            <X size={14} strokeWidth={2} /> Fermer
          </button>
        </div>
      </div>
      {error && <div className="no-print px-4 pt-3 sm:px-6"><ErrorBanner>{error}</ErrorBanner></div>}

      {/* Document — la zone imprimée */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="report-print-area mx-auto max-w-4xl space-y-6">
          {/* En-tête du document */}
          <header className="border-b-2 border-accent pb-4">
            <p className="font-display text-xs font-bold uppercase tracking-widest text-accent-ink">BudgetPilot360</p>
            <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-fg">
              Rapport financier — {data.company_name}
            </h1>
            <p className="mt-1 text-xs text-fg-muted">
              Période du {frDate(data.date_from)} au {frDate(data.date_to)} · généré le {frDate(data.generated_on)}
            </p>
          </header>

          {/* ---- Section 1 : Bilan résumé ---- */}
          <section className="print-section card space-y-5 p-6">
            <div>
              <h2 className="font-display text-base font-semibold text-fg">Section 1 — Bilan résumé</h2>
              <p className="text-xs text-fg-muted">L'essentiel de la période en un coup d'œil.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Hero label={`Recettes confirmées (${data.count_revenue_approved})`} value={fcfa(data.total_revenue)} tone="positive" />
              <Hero label={`Dépenses approuvées (${data.count_approved})`} value={fcfa(data.total_approved)} />
              <Hero label={`Bénéfice net · marge ${margin}`} value={fcfa(data.net_profit)} tone={netTone} />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <CategoryDonut
                title="Répartition des dépenses"
                rows={toChartRows(data.breakdown)}
                emptyText="Aucune dépense approuvée sur la période."
                compact
                maxLegendRows={5}
              />
              <CategoryDonut
                title="Répartition des recettes"
                rows={toChartRows(data.revenue_breakdown)}
                emptyText="Aucune recette confirmée sur la période."
                compact
                maxLegendRows={5}
              />
            </div>
          </section>

          {/* ---- Section 2 : Bilan détaillé ---- */}
          {scope === "full" && (
            <section className="print-section card space-y-6 p-6">
              <div>
                <h2 className="font-display text-base font-semibold text-fg">Section 2 — Bilan détaillé</h2>
                <p className="text-xs text-fg-muted">Graphiques complets, puis détail ligne à ligne.</p>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="print-block">
                  <FinancialWaterfall revenues={data.total_revenue} expenses={data.total_approved} subtitle="Recettes → Dépenses → Bénéfice net" />
                </div>
                {hasMonthly && (
                  <div className="print-block">
                    <h3 className="font-display text-sm font-semibold text-fg">Évolution sur la période</h3>
                    <p className="text-xs text-fg-muted">Recettes, dépenses et bénéfice net par mois</p>
                    <div className="mt-3">
                      <RevenueExpenseArea data={data.monthly} monthTick={monthTick} tooltip={<MonthlyTooltip />} />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="print-block">
                  <BudgetVsActual title="Budget vs Consommé" subtitle="Dépenses par catégorie" rows={toChartRows(data.breakdown)} kind="expense" emptyText="Aucun budget par catégorie défini." />
                </div>
                <div className="print-block">
                  <BudgetVsActual title="Objectif vs Réalisé" subtitle="Recettes par catégorie" rows={toChartRows(data.revenue_breakdown)} kind="revenue" emptyText="Aucun objectif de recettes défini." />
                </div>
              </div>

              <div className="print-block">
                <h3 className="font-display text-sm font-semibold text-fg">Détail des recettes ({data.revenues.length})</h3>
                <DetailTable rows={data.revenues} withSource empty="Aucune recette sur la période." />
              </div>
              <div className="print-block">
                <h3 className="font-display text-sm font-semibold text-fg">Détail des dépenses ({data.expenses.length})</h3>
                <DetailTable rows={data.expenses} withSource={false} empty="Aucune dépense sur la période." />
              </div>
              <div className="print-block">
                <h3 className="font-display text-sm font-semibold text-fg">Recettes par catégorie</h3>
                <BreakdownTable rows={data.revenue_breakdown} plannedLabel="Objectif" actualLabel="Réalisé" />
              </div>
              <div className="print-block">
                <h3 className="font-display text-sm font-semibold text-fg">Dépenses par catégorie</h3>
                <BreakdownTable rows={data.breakdown} plannedLabel="Budget prévu" actualLabel="Consommé" />
              </div>
            </section>
          )}

          <p className="pb-6 text-center text-[10px] text-fg-subtle">
            BudgetPilot360 — Pukri AI Systems
          </p>
        </div>
      </div>
    </div>
  );
}
