import { useState } from "react";
import { motion } from "framer-motion";
import { FileSpreadsheet, FileText } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { api } from "../lib/api";

type PresetId = "month" | "quarter" | "year" | "last30" | "custom";
type ExportFormat = "pdf" | "excel";

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

async function blobErrorMessage(error: unknown): Promise<string> {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      const detail = JSON.parse(await error.response.data.text())?.detail;
      if (typeof detail === "string") return detail;
    } catch {
      /* blob non-JSON */
    }
  }
  return "Impossible de générer le rapport. Réessayez dans un instant.";
}

export default function ReportsPage() {
  const [preset, setPreset] = useState<PresetId>("year");
  const [customFrom, setCustomFrom] = useState(presetRange("month").from);
  const [customTo, setCustomTo] = useState(presetRange("month").to);
  const [error, setError] = useState<string | null>(null);

  const range = preset === "custom" ? { from: customFrom, to: customTo } : presetRange(preset);
  const rangeValid = range.from !== "" && range.to !== "" && range.from <= range.to;

  const exporter = useMutation({
    mutationFn: async (format: ExportFormat) => {
      const resp = await api.get("/reports/export", {
        params: { format, date_from: range.from, date_to: range.to },
        responseType: "blob",
      });
      const extension = format === "pdf" ? "pdf" : "xlsx";
      const url = URL.createObjectURL(resp.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rapport_budgetpilot360_${range.from}_${range.to}.${extension}`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onMutate: () => setError(null),
    onError: async (err) => setError(await blobErrorMessage(err)),
  });

  const pendingFormat = exporter.isPending ? exporter.variables : null;
  const presetBtn = (active: boolean) =>
    active
      ? "bg-accent text-accent-fg shadow-card"
      : "border border-line-strong text-fg-muted hover:bg-surface-2 hover:text-fg";

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Rapports</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Le compte de résultat de la période : recettes, dépenses et bénéfice net, avec le détail
        et la répartition par catégorie.
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

        <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-5">
          <motion.button type="button" whileTap={{ scale: 0.98 }} disabled={!rangeValid || exporter.isPending} onClick={() => exporter.mutate("pdf")} className="btn btn-primary">
            <FileText size={16} strokeWidth={2} />
            {pendingFormat === "pdf" ? "Génération…" : "Télécharger le PDF"}
          </motion.button>
          <motion.button type="button" whileTap={{ scale: 0.98 }} disabled={!rangeValid || exporter.isPending} onClick={() => exporter.mutate("excel")} className="btn btn-ghost">
            <FileSpreadsheet size={16} strokeWidth={2} />
            {pendingFormat === "excel" ? "Génération…" : "Télécharger l'Excel"}
          </motion.button>
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
          <li>• Synthèse <strong className="text-fg">Recettes · Dépenses · Bénéfice</strong> : recettes confirmées, dépenses approuvées, bénéfice net et marge.</li>
          <li>• Détail des recettes et des dépenses : date, catégorie, auteur, source/client, montant et statut.</li>
          <li>• Répartition par catégorie : réalisé vs objectif (recettes), consommé vs budget (dépenses).</li>
        </ul>
        <p className="mt-3 text-xs text-fg-subtle">
          PDF : mise en page A4 paginée, prête à partager. Excel : cinq feuilles formatées
          (Résumé, Recettes, Dépenses, Recettes/Dépenses par catégorie).
        </p>
      </motion.section>
    </div>
  );
}
