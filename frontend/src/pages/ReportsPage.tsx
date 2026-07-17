import { useState } from "react";
import { motion } from "framer-motion";
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

/** Lit le message d'erreur FastAPI depuis une réponse blob (axios responseType: "blob"). */
async function blobErrorMessage(error: unknown): Promise<string> {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      const detail = JSON.parse(await error.response.data.text())?.detail;
      if (typeof detail === "string") return detail;
    } catch {
      /* blob non-JSON : message générique */
    }
  }
  return "Échec de la génération du rapport. Réessayez.";
}

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

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

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Rapports</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Export professionnel du rapport budgétaire : résumé, détail des dépenses de la
        période et répartition par catégorie.
      </p>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950"
      >
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Période</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                preset === p.id
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="dateFrom" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Du
              </label>
              <input
                id="dateFrom"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="dateTo" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Au
              </label>
              <input
                id="dateTo"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          {rangeValid
            ? `Rapport du ${frDate(range.from)} au ${frDate(range.to)}.`
            : "Période invalide : la date de début doit précéder la date de fin."}
        </p>

        <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
          <button
            type="button"
            disabled={!rangeValid || exporter.isPending}
            onClick={() => exporter.mutate("pdf")}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {pendingFormat === "pdf" ? "Génération…" : "📄 Télécharger le PDF"}
          </button>
          <button
            type="button"
            disabled={!rangeValid || exporter.isPending}
            onClick={() => exporter.mutate("excel")}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            {pendingFormat === "excel" ? "Génération…" : "📊 Télécharger l'Excel"}
          </button>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut", delay: 0.08 }}
        className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950"
      >
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Contenu du rapport
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <li>• Résumé budgétaire : budget annuel, montants approuvés / en attente / rejetés de la période.</li>
          <li>• Détail des dépenses : date, catégorie, auteur, description, montant et statut.</li>
          <li>• Répartition par catégorie : consommé vs budget prévu, avec pourcentage.</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          PDF : mise en page A4 paginée, prête à partager. Excel : trois feuilles
          formatées (Résumé, Dépenses, Par catégorie) avec filtres automatiques.
        </p>
      </motion.section>
    </div>
  );
}
