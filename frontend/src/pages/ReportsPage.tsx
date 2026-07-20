import { useState } from "react";
import { motion } from "framer-motion";
import { DatabaseBackup, Eye, FileBarChart } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
import ReportPreview, { type ReportData } from "../components/ReportPreview";

type PresetId = "month" | "quarter" | "year" | "last30" | "custom";

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function presetRange(preset: PresetId): { from: string; to: string } {
  const now = new Date();
  const to = toISO(now);
  switch (preset) {
    case "month":
      return { from: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    case "quarter": {
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      return { from: toISO(quarterStart), to };
    }
    case "year":
      return { from: toISO(new Date(now.getFullYear(), 0, 1)), to };
    case "last30": {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { from: toISO(start), to };
    }
    default:
      return { from: to, to };
  }
}

const PRESETS: { id: PresetId; label: string }[] = [
  { id: "month", label: "Mois en cours" },
  { id: "quarter", label: "Trimestre en cours" },
  { id: "year", label: "Année en cours" },
  { id: "last30", label: "30 derniers jours" },
  { id: "custom", label: "Personnalisée" },
];

const frDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

/**
 * Rapports — flux « Générer → Prévisualiser → Décider » : un seul bouton
 * calcule les données (GET /reports/data), l'aperçu s'ouvre dans l'app, et
 * c'est depuis l'aperçu qu'on télécharge (PDF/Excel, complet ou résumé),
 * imprime, ou ferme sans rien télécharger.
 */
export default function ReportsPage() {
  const [preset, setPreset] = useState<PresetId>("year");
  const [customFrom, setCustomFrom] = useState(presetRange("month").from);
  const [customTo, setCustomTo] = useState(presetRange("month").to);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);

  const range = preset === "custom" ? { from: customFrom, to: customTo } : presetRange(preset);
  const rangeValid = range.from !== "" && range.to !== "" && range.from <= range.to;

  const generate = useMutation({
    mutationFn: async () =>
      (await api.get<ReportData>("/reports/data", {
        params: { date_from: range.from, date_to: range.to },
      })).data,
    onMutate: () => setError(null),
    onSuccess: (data) => setReport(data),
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const exportAll = useMutation({
    mutationFn: async () => {
      const resp = await api.get("/reports/company-export", { responseType: "blob" });
      const url = URL.createObjectURL(resp.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `donnees_budgetpilot360_${toISO(new Date())}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onMutate: () => setError(null),
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const presetBtn = (active: boolean) =>
    active
      ? "bg-accent text-accent-fg shadow-card"
      : "border border-line-strong text-fg-muted hover:bg-surface-2 hover:text-fg";

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Rapports</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Générez le compte de résultat de la période, prévisualisez-le dans l'app,
        puis décidez : PDF, Excel, impression — ou rien.
      </p>

      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</div>
      )}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="card mt-6 p-6"
      >
        <h2 className="font-display text-sm font-semibold text-fg">Période</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => setPreset(p.id)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${presetBtn(preset === p.id)}`}>
              {p.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="dateFrom" className="mb-1.5 block text-xs font-medium text-fg-muted">Du</label>
              <input id="dateFrom" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="field" />
            </div>
            <div>
              <label htmlFor="dateTo" className="mb-1.5 block text-xs font-medium text-fg-muted">Au</label>
              <input id="dateTo" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="field" />
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-fg-subtle">
          {rangeValid
            ? `Rapport du ${frDate(range.from)} au ${frDate(range.to)}.`
            : "Période invalide : la date de début doit précéder la date de fin."}
        </p>

        <div className="mt-5 border-t border-line pt-5">
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            disabled={!rangeValid || generate.isPending}
            onClick={() => generate.mutate()}
            className="btn btn-primary"
          >
            {generate.isPending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                Calcul du rapport…
              </>
            ) : (
              <>
                <FileBarChart size={16} strokeWidth={2} /> Générer le rapport
              </>
            )}
          </motion.button>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-subtle">
            <Eye size={13} strokeWidth={2} />
            Rien n'est téléchargé à cette étape : vous verrez d'abord un aperçu fidèle.
          </p>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
        className="card mt-4 p-6"
      >
        <h2 className="font-display text-sm font-semibold text-fg">Ce que contient le rapport</h2>
        <ul className="mt-3 space-y-2 text-sm text-fg-muted">
          <li>• <strong className="text-fg">Section 1 — Bilan résumé</strong> : recettes, dépenses, bénéfice net et marge en évidence, répartition par catégorie (donuts + top 5). Tout tient sur une page.</li>
          <li>• <strong className="text-fg">Section 2 — Bilan détaillé</strong> : pont financier, budget vs réalisé, évolution mensuelle, et le détail ligne à ligne des recettes et dépenses.</li>
          <li>• Téléchargement au choix : rapport <strong className="text-fg">complet</strong> ou <strong className="text-fg">résumé seul</strong>, en PDF (graphiques inclus) ou Excel (graphiques natifs).</li>
        </ul>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.14 }}
        className="card mt-4 p-6"
      >
        <h2 className="font-display text-sm font-semibold text-fg">Vos données vous appartiennent</h2>
        <p className="mt-2 text-sm text-fg-muted">
          Téléchargez à tout moment l'intégralité des données de votre entreprise dans un
          classeur Excel : équipe, catégories, toutes les dépenses et recettes (tous statuts,
          toutes périodes), automatisations et journal d'audit.
        </p>
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          disabled={exportAll.isPending}
          onClick={() => exportAll.mutate()}
          className="btn btn-ghost mt-4 border border-line-strong"
        >
          {exportAll.isPending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
              Préparation de l'export…
            </>
          ) : (
            <>
              <DatabaseBackup size={16} strokeWidth={2} /> Exporter toutes mes données (Excel)
            </>
          )}
        </motion.button>
        <p className="mt-2 text-xs text-fg-subtle">
          Les justificatifs (fichiers joints) ne sont pas inclus dans le classeur — ils restent
          téléchargeables depuis chaque dépense ou recette.
        </p>
      </motion.section>

      {report && (
        <ReportPreview
          data={report}
          onClose={() => setReport(null)}
          onDownloadError={() => undefined}
        />
      )}
    </div>
  );
}
