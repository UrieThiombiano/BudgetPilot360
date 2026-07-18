/**
 * Dépenses automatiques (admin) — licences, abonnements, loyers…
 * L'admin définit catégorie + montant + jour du mois + nombre de mois ;
 * chaque échéance est décomptée automatiquement (dépense approuvée, sans
 * validation), puis l'automatisation s'arrête d'elle-même.
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

const labelClass = "mb-1.5 block text-xs font-medium text-fg-muted";
const frDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

function statusBadge(r: Recurring) {
  if (r.months_done >= r.months_total)
    return { label: "Terminée", cls: "bg-surface-2 text-fg-muted" };
  return r.active
    ? { label: "Active", cls: "bg-success-soft text-success-ink" }
    : { label: "En pause", cls: "bg-warning-soft text-warning-ink" };
}

export default function RecurringExpenses() {
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
    queryKey: ["categories", "expense"],
    queryFn: async () =>
      (await api.get<Category[]>("/categories", { params: { type: "expense" } })).data,
  });
  const { data: items, isLoading } = useQuery({
    queryKey: ["recurring-expenses"],
    queryFn: async () => (await api.get<Recurring[]>("/recurring-expenses")).data,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["recurring-expenses"] });
    // La matérialisation a pu décompter une échéance immédiatement.
    void queryClient.invalidateQueries({ queryKey: ["my-expenses"] });
  };

  const createRecurring = useMutation({
    mutationFn: async () =>
      (await api.post<Recurring>("/recurring-expenses", {
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
      setMessage(
        `Automatisation créée — ${created.months_done > 0 ? "première échéance déjà décomptée, prochaine" : "première échéance"} le ${frDate(created.next_due)}. Aucune validation nécessaire.`
      );
      refresh();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      (await api.patch(`/recurring-expenses/${id}`, { active })).data,
    onSuccess: (_d, vars) => {
      setMessage(vars.active ? "Décompte repris." : "Décompte mis en pause.");
      refresh();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const removeRecurring = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/recurring-expenses/${id}`)).data,
    onSuccess: () => {
      setConfirmDeleteId(null);
      setMessage("Automatisation supprimée — les dépenses déjà décomptées restent dans l'historique.");
      refresh();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!categoryId) {
      setError("Choisissez une catégorie de dépense.");
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
          <h2 className="font-display text-base font-semibold text-fg">Dépenses automatiques</h2>
          <p className="text-xs text-fg-muted">
            Licences, abonnements, loyers… décomptés chaque mois sans validation, puis arrêtés automatiquement.
          </p>
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
        <p className="mt-4 text-sm text-fg-muted">
          Aucune dépense automatique — créez la première ci-dessous (ex : licence logicielle mensuelle).
        </p>
      )}

      {/* Création */}
      <form onSubmit={handleSubmit} className="mt-5 space-y-4 border-t border-line pt-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label htmlFor="recDesc" className={labelClass}>Libellé</label>
            <input id="recDesc" required minLength={2} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} className="field" placeholder="Ex : licence comptabilité, loyer bureau…" />
          </div>
          <div>
            <label htmlFor="recAmount" className={labelClass}>Montant (FCFA)</label>
            <input id="recAmount" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="field tnum" placeholder="45000" />
          </div>
          <div>
            <label htmlFor="recCategory" className={labelClass}>Catégorie</label>
            <select id="recCategory" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="field">
              <option value="">Sélectionner…</option>
              {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="recDay" className={labelClass}>Jour du mois</label>
              <input id="recDay" type="number" min={1} max={31} required value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} className="field tnum" />
            </div>
            <div>
              <label htmlFor="recMonths" className={labelClass}>Nb de mois</label>
              <input id="recMonths" type="number" min={1} max={120} required value={monthsTotal} onChange={(e) => setMonthsTotal(e.target.value)} className="field tnum" />
            </div>
          </div>
        </div>

        {error && <ErrorBanner>{error}</ErrorBanner>}
        {message && <SuccessBanner>{message}</SuccessBanner>}

        <motion.button type="submit" whileTap={{ scale: 0.985 }} disabled={createRecurring.isPending} className="btn btn-primary">
          <Repeat size={15} strokeWidth={2.25} />
          {createRecurring.isPending ? "Création…" : "Activer le décompte automatique"}
        </motion.button>
      </form>
    </section>
  );
}
