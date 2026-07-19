/**
 * Automatisations mensuelles (admin uniquement, adjoint compris) — un seul
 * composant pour les deux familles, paramétré par config :
 * - Dépenses automatiques : chaque échéance crée une dépense À VALIDER
 *   (workflow d'approbation standard).
 * - Recettes attendues : chaque échéance crée une recette confirmée (les
 *   recettes sont comptées sans validation). Invisible pour les users.
 */
import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Pause, Play, Repeat, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
import { ErrorBanner, SuccessBanner, CardSkeleton } from "./ui";
import { fcfa } from "../lib/format";

interface Category { id: string; name: string }
interface Recurring {
  id: string;
  category_id: string;
  category_name: string | null;
  amount: number;
  description: string;
  day_of_month: number;
  months_total: number;
  months_done: number;
  active: boolean;
  next_due: string;
}

export interface RecurringConfig {
  endpoint: string; // "/recurring-expenses" | "/recurring-revenues"
  queryKey: string;
  categoryType: "expense" | "revenue";
  /** Listes à rafraîchir après matérialisation (une échéance a pu être générée). */
  extraInvalidateKeys: string[][];
  title: string;
  subtitle: string;
  emptyText: string;
  submitLabel: string;
  /** Message de succès à la création ; `firstDone` = première échéance déjà générée. */
  createdMessage: (firstDone: boolean, nextDueFr: string) => string;
  deletedMessage: string;
  noCategoryError: string;
  descPlaceholder: string;
  amountPlaceholder: string;
}

export const RECURRING_EXPENSES_CONFIG: RecurringConfig = {
  endpoint: "/recurring-expenses",
  queryKey: "recurring-expenses",
  categoryType: "expense",
  extraInvalidateKeys: [["my-expenses"], ["pending-expenses"]],
  title: "Dépenses automatiques",
  subtitle:
    "Licences, abonnements, loyers… chaque échéance crée une dépense à valider dans « Dépenses à valider », puis l'automatisation s'arrête d'elle-même.",
  emptyText:
    "Aucune dépense automatique — créez la première ci-dessous (ex : licence logicielle mensuelle).",
  submitLabel: "Activer le décompte automatique",
  createdMessage: (firstDone, nextDueFr) =>
    `Automatisation créée — ${firstDone ? "première échéance déjà générée, prochaine" : "première échéance"} le ${nextDueFr}. Chaque échéance devra être validée dans « Dépenses à valider ».`,
  deletedMessage:
    "Automatisation supprimée — les dépenses déjà générées restent dans l'historique.",
  noCategoryError: "Choisissez une catégorie de dépense.",
  descPlaceholder: "Ex : licence comptabilité, loyer bureau…",
  amountPlaceholder: "45000",
};

export const RECURRING_REVENUES_CONFIG: RecurringConfig = {
  endpoint: "/recurring-revenues",
  queryKey: "recurring-revenues",
  categoryType: "revenue",
  extraInvalidateKeys: [["my-revenues"]],
  title: "Recettes attendues",
  subtitle:
    "Loyers perçus, abonnements clients, mensualités… comptées automatiquement chaque mois. Visibles uniquement par vous et votre adjoint.",
  emptyText:
    "Aucune recette attendue — créez la première ci-dessous (ex : loyer mensuel perçu).",
  submitLabel: "Activer la recette automatique",
  createdMessage: (firstDone, nextDueFr) =>
    `Automatisation créée — ${firstDone ? "première échéance déjà comptée, prochaine" : "première échéance"} le ${nextDueFr}. Chaque recette est confirmée automatiquement.`,
  deletedMessage:
    "Automatisation supprimée — les recettes déjà comptées restent dans l'historique.",
  noCategoryError: "Choisissez une catégorie de recette.",
  descPlaceholder: "Ex : loyer boutique, abonnement client…",
  amountPlaceholder: "150000",
};

const labelClass = "mb-1.5 block text-xs font-medium text-fg-muted";
const frDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

function statusBadge(r: Recurring) {
  if (r.months_done >= r.months_total)
    return { label: "Terminée", cls: "bg-surface-2 text-fg-muted" };
  return r.active
    ? { label: "Active", cls: "bg-success-soft text-success-ink" }
    : { label: "En pause", cls: "bg-warning-soft text-warning-ink" };
}

export default function RecurringAutomations({ config }: { config: RecurringConfig }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [monthsTotal, setMonthsTotal] = useState("12");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["categories", config.categoryType],
    queryFn: async () =>
      (await api.get<Category[]>("/categories", { params: { type: config.categoryType } })).data,
  });
  const { data: items, isLoading } = useQuery({
    queryKey: [config.queryKey],
    queryFn: async () => (await api.get<Recurring[]>(config.endpoint)).data,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [config.queryKey] });
    // La matérialisation a pu générer une échéance immédiatement.
    for (const key of config.extraInvalidateKeys) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const createRecurring = useMutation({
    mutationFn: async () =>
      (await api.post<Recurring>(config.endpoint, {
        category_id: categoryId,
        amount: Number(amount),
        description: description.trim(),
        day_of_month: Number(dayOfMonth),
        months_total: Number(monthsTotal),
        active: true,
      })).data,
    onSuccess: (created) => {
      setAmount("");
      setDescription("");
      setMessage(config.createdMessage(created.months_done > 0, frDate(created.next_due)));
      refresh();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      (await api.patch(`${config.endpoint}/${id}`, { active })).data,
    onSuccess: (_d, vars) => {
      setMessage(vars.active ? "Décompte repris." : "Décompte mis en pause.");
      refresh();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const removeRecurring = useMutation({
    mutationFn: async (id: string) => (await api.delete(`${config.endpoint}/${id}`)).data,
    onSuccess: () => {
      setConfirmDeleteId(null);
      setMessage(config.deletedMessage);
      refresh();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!categoryId) {
      setError(config.noCategoryError);
      return;
    }
    createRecurring.mutate();
  }

  return (
    <section className="card mt-6 p-6">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
          <Repeat size={16} strokeWidth={2} />
        </span>
        <div>
          <h2 className="font-display text-base font-semibold text-fg">{config.title}</h2>
          <p className="text-xs text-fg-muted">{config.subtitle}</p>
        </div>
      </div>

      {/* Liste des automatisations */}
      {isLoading && (
        <div aria-busy="true" className="mt-4 space-y-3">
          <CardSkeleton lines={1} />
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="mt-4 space-y-3">
          {items.map((r) => {
            const badge = statusBadge(r);
            const finished = r.months_done >= r.months_total;
            const pct = Math.min((r.months_done / r.months_total) * 100, 100);
            return (
              <li key={r.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-fg">
                      <span className="tnum">{fcfa(r.amount)}</span>{" "}
                      <span className="text-sm font-normal text-fg-muted">
                        · {r.description} · {r.category_name ?? "Catégorie supprimée"}
                      </span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle">
                      <CalendarClock size={13} strokeWidth={2} />
                      Le {r.day_of_month} de chaque mois · {r.months_done}/{r.months_total} décompté(s)
                      {!finished && r.active && ` · prochaine échéance le ${frDate(r.next_due)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {!finished && (
                      <button
                        type="button"
                        onClick={() => { setError(null); setMessage(null); toggleActive.mutate({ id: r.id, active: !r.active }); }}
                        disabled={toggleActive.isPending}
                        aria-label={`${r.active ? "Mettre en pause" : "Reprendre"} ${r.description}`}
                        className="btn btn-ghost px-2.5 py-1 text-xs"
                      >
                        {r.active
                          ? <><Pause size={13} strokeWidth={2} /> Pause</>
                          : <><Play size={13} strokeWidth={2} /> Reprendre</>}
                      </button>
                    )}
                    {confirmDeleteId === r.id ? (
                      <span className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => removeRecurring.mutate(r.id)}
                          disabled={removeRecurring.isPending}
                          className="btn px-2.5 py-1 text-xs"
                          style={{ backgroundColor: "var(--danger)", color: "var(--danger-fg)" }}
                        >
                          Confirmer
                        </button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} className="btn btn-ghost px-2.5 py-1 text-xs">
                          Annuler
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setError(null); setMessage(null); setConfirmDeleteId(r.id); }}
                        aria-label={`Supprimer ${r.description}`}
                        className="btn btn-danger px-2.5 py-1 text-xs"
                      >
                        <Trash2 size={13} strokeWidth={2} /> Supprimer
                      </button>
                    )}
                  </div>
                </div>
                {/* Progression du décompte */}
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Progression : ${r.months_done} sur ${r.months_total} mois`}
                  className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
                >
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {items && items.length === 0 && (
        <p className="mt-4 text-sm text-fg-muted">{config.emptyText}</p>
      )}

      {/* Création */}
      <form onSubmit={handleSubmit} className="mt-5 space-y-4 border-t border-line pt-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label htmlFor={`recDesc-${config.queryKey}`} className={labelClass}>Libellé</label>
            <input id={`recDesc-${config.queryKey}`} required minLength={2} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} className="field" placeholder={config.descPlaceholder} />
          </div>
          <div>
            <label htmlFor={`recAmount-${config.queryKey}`} className={labelClass}>Montant (FCFA)</label>
            <input id={`recAmount-${config.queryKey}`} type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="field tnum" placeholder={config.amountPlaceholder} />
          </div>
          <div>
            <label htmlFor={`recCategory-${config.queryKey}`} className={labelClass}>Catégorie</label>
            <select id={`recCategory-${config.queryKey}`} required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="field">
              <option value="">Sélectionner…</option>
              {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`recDay-${config.queryKey}`} className={labelClass}>Jour du mois</label>
              <input id={`recDay-${config.queryKey}`} type="number" min={1} max={31} required value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} className="field tnum" />
            </div>
            <div>
              <label htmlFor={`recMonths-${config.queryKey}`} className={labelClass}>Nb de mois</label>
              <input id={`recMonths-${config.queryKey}`} type="number" min={1} max={120} required value={monthsTotal} onChange={(e) => setMonthsTotal(e.target.value)} className="field tnum" />
            </div>
          </div>
        </div>

        {error && <ErrorBanner>{error}</ErrorBanner>}
        {message && <SuccessBanner>{message}</SuccessBanner>}

        <motion.button type="submit" whileTap={{ scale: 0.985 }} disabled={createRecurring.isPending} className="btn btn-primary">
          <Repeat size={15} strokeWidth={2.25} />
          {createRecurring.isPending ? "Création…" : config.submitLabel}
        </motion.button>
      </form>
    </section>
  );
}
