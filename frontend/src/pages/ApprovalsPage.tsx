import { useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
import { CardSkeleton, ErrorBanner, SuccessBanner } from "../components/ui";
import { fcfa } from "../lib/format";

interface PendingExpense {
  id: string;
  amount: number;
  expense_date: string;
  description: string | null;
  category_name: string | null;
  author_name: string | null;
  has_receipt: boolean;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: pending, isLoading, isError } = useQuery({
    queryKey: ["pending-expenses"],
    queryFn: async () => (await api.get<PendingExpense[]>("/expenses/pending")).data,
  });

  const review = useMutation({
    mutationFn: async (args: { id: string; action: "approve" | "reject"; reason?: string }) =>
      (
        await api.post(`/expenses/${args.id}/review`, {
          action: args.action,
          reason: args.reason ?? null,
        })
      ).data,
    onSuccess: (_data, args) => {
      setMessage(args.action === "approve" ? "Dépense approuvée — budget mis à jour." : "Dépense rejetée — l'utilisateur est notifié.");
      setRejectingId(null);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["pending-expenses"] });
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (err) => {
      setError(apiErrorMessage(err));
      void queryClient.invalidateQueries({ queryKey: ["pending-expenses"] });
    },
  });

  const openReceipt = async (expenseId: string) => {
    try {
      const { data } = await api.get<{ url: string }>(`/expenses/${expenseId}/receipt`);
      window.open(data.url, "_blank", "noopener");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
        Dépenses en attente
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Approuvez ou rejetez les dépenses soumises — le budget des catégories se met
        à jour automatiquement à l'approbation.
      </p>

      {error && <ErrorBanner className="mt-4">{error}</ErrorBanner>}
      {message && <SuccessBanner className="mt-4">{message}</SuccessBanner>}

      <div className="mt-6 space-y-3">
        {isLoading && (
          <div aria-busy="true" className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <CardSkeleton key={i} lines={1} />
            ))}
          </div>
        )}
        {isError && (
          <ErrorBanner>
            Impossible de charger les dépenses en attente. Réessayez.
          </ErrorBanner>
        )}
        {pending?.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            ✨ Aucune dépense en attente — tout est traité.
          </p>
        )}
        {(pending ?? []).map((exp, index) => (
          <motion.div
            key={exp.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
            className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">
                  {fcfa(exp.amount)}{" "}
                  <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                    · {exp.category_name ?? "?"} ·{" "}
                    {new Date(exp.expense_date).toLocaleDateString("fr-FR")}
                  </span>
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Par <span className="font-medium">{exp.author_name ?? "?"}</span>
                  {exp.description ? ` — ${exp.description}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {exp.has_receipt && (
                  <button
                    type="button"
                    onClick={() => void openReceipt(exp.id)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    📎 Justificatif
                  </button>
                )}
                <button
                  type="button"
                  disabled={review.isPending}
                  onClick={() => {
                    setError(null);
                    setMessage(null);
                    review.mutate({ id: exp.id, action: "approve" });
                  }}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  ✓ Approuver
                </button>
                <button
                  type="button"
                  disabled={review.isPending}
                  onClick={() => {
                    setError(null);
                    setMessage(null);
                    setRejectingId(rejectingId === exp.id ? null : exp.id);
                    setReason("");
                  }}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  ✕ Rejeter
                </button>
              </div>
            </div>

            {rejectingId === exp.id && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reason.trim()) {
                    setError("Le motif de rejet est obligatoire.");
                    return;
                  }
                  setError(null);
                  review.mutate({ id: exp.id, action: "reject", reason: reason.trim() });
                }}
                className="mt-3 flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800"
              >
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  autoFocus
                  placeholder="Motif du rejet (obligatoire, visible par l'utilisateur)"
                  aria-label="Motif du rejet"
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={review.isPending || !reason.trim()}
                  className="whitespace-nowrap rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  Confirmer le rejet
                </button>
              </form>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
