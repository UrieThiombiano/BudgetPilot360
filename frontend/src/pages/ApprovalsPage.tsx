import { useState } from "react";
import { motion } from "framer-motion";
import { Check, ListChecks, Paperclip, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
import { CardSkeleton, EmptyState, ErrorBanner, SuccessBanner } from "../components/ui";
import { fcfa } from "../lib/format";

/**
 * Approbations — uniquement les DÉPENSES : une dépense soumise attend l'aval de
 * l'admin. Les recettes n'ont pas de validation (comptées dès l'enregistrement).
 */

interface PendingExpense {
  id: string;
  amount: number;
  expense_date: string;
  description: string | null;
  category_name: string | null;
  author_name: string | null;
  has_receipt: boolean;
}

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
      (await api.post(`/expenses/${args.id}/review`, { action: args.action, reason: args.reason ?? null })).data,
    onSuccess: (_data, args) => {
      setMessage(
        args.action === "approve"
          ? "Dépense approuvée — le budget est mis à jour."
          : "Dépense refusée — l'auteur est notifié."
      );
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

  const openReceipt = async (id: string) => {
    try {
      const { data } = await api.get<{ url: string }>(`/expenses/${id}/receipt`);
      window.open(data.url, "_blank", "noopener");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Dépenses à valider</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Approuvez ou refusez les dépenses soumises — le budget se met à jour automatiquement.
        Les recettes, elles, sont comptées sans validation.
      </p>

      {error && <ErrorBanner className="mt-4">{error}</ErrorBanner>}
      {message && <SuccessBanner className="mt-4">{message}</SuccessBanner>}

      <div className="mt-6 space-y-3">
        {isLoading && (
          <div aria-busy="true" className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} lines={1} />)}
          </div>
        )}
        {isError && <ErrorBanner>Impossible d'afficher les dépenses à valider. Réessayez.</ErrorBanner>}
        {pending?.length === 0 && (
          <EmptyState
            icon={ListChecks}
            title="Tout est à jour"
            description="Aucune dépense n'attend votre validation pour le moment."
          />
        )}
        {(pending ?? []).map((exp, index) => (
          <motion.div
            key={exp.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
            className="card p-4 transition-shadow hover:shadow-elevated"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-fg">
                  <span className="tnum">{fcfa(exp.amount)}</span>{" "}
                  <span className="text-sm font-normal text-fg-muted">
                    · {exp.category_name ?? "Catégorie inconnue"} ·{" "}
                    {new Date(exp.expense_date).toLocaleDateString("fr-FR")}
                  </span>
                </p>
                <p className="text-sm text-fg-muted">
                  Par <span className="font-medium text-fg">{exp.author_name ?? "Auteur inconnu"}</span>
                  {exp.description ? ` — ${exp.description}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {exp.has_receipt && (
                  <button type="button" onClick={() => void openReceipt(exp.id)} className="btn btn-ghost px-2.5 py-1.5 text-xs">
                    <Paperclip size={14} strokeWidth={2} /> Justificatif
                  </button>
                )}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  disabled={review.isPending}
                  onClick={() => {
                    setError(null);
                    setMessage(null);
                    review.mutate({ id: exp.id, action: "approve" });
                  }}
                  className="btn px-3 py-1.5 text-sm"
                  style={{ backgroundColor: "var(--success)", color: "var(--success-fg)" }}
                >
                  <Check size={15} strokeWidth={2.25} /> Approuver
                </motion.button>
                <button
                  type="button"
                  disabled={review.isPending}
                  onClick={() => {
                    setError(null);
                    setMessage(null);
                    setRejectingId(rejectingId === exp.id ? null : exp.id);
                    setReason("");
                  }}
                  className="btn btn-danger px-3 py-1.5 text-sm"
                >
                  <X size={15} strokeWidth={2.25} /> Refuser
                </button>
              </div>
            </div>

            {rejectingId === exp.id && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reason.trim()) {
                    setError("Indiquez un motif de refus (visible par l'auteur).");
                    return;
                  }
                  setError(null);
                  review.mutate({ id: exp.id, action: "reject", reason: reason.trim() });
                }}
                className="mt-3 flex gap-2 border-t border-line pt-3"
              >
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  autoFocus
                  placeholder="Motif du refus — visible par l'auteur"
                  aria-label="Motif du refus"
                  className="field"
                />
                <button type="submit" disabled={review.isPending || !reason.trim()} className="btn px-3 py-2 text-sm" style={{ backgroundColor: "var(--danger)", color: "var(--danger-fg)" }}>
                  Confirmer le refus
                </button>
              </form>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
