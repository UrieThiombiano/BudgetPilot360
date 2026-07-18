import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { CardSkeleton, ErrorBanner } from "../components/ui";
import { fcfa } from "../lib/format";

type CatType = "expense" | "revenue";

interface Company { id: string; name: string; annual_budget: number }
interface Category { id: string; name: string; type: CatType; planned_budget: number; consumed: number }

const LABELS: Record<CatType, {
  section: string; planned: string; newTitle: string; newPlaceholder: string;
  emptyHint: string; allocated: string; done: string;
}> = {
  expense: {
    section: "Catégories de dépenses",
    planned: "Budget prévu (FCFA)",
    newTitle: "Nouvelle catégorie de dépense",
    newPlaceholder: "Ex : Transport, Carburant, Salaires…",
    emptyHint: " Créez votre premier poste de dépense ci-dessous.",
    allocated: "Budget alloué",
    done: "Consommé",
  },
  revenue: {
    section: "Catégories de recettes",
    planned: "Objectif de recettes (FCFA)",
    newTitle: "Nouvelle catégorie de recette",
    newPlaceholder: "Ex : Ventes, Prestations, Subventions…",
    emptyHint: " Créez votre premier poste de recette ci-dessous.",
    allocated: "Objectif total",
    done: "Réalisé",
  },
};

const labelClass = "mb-1.5 block text-xs font-medium text-fg-muted";

function ProgressBar({ consumed, planned, kind }: { consumed: number; planned: number; kind: CatType }) {
  const ratio = planned > 0 ? consumed / planned : consumed > 0 ? 1.01 : 0;
  const pct = Math.min(ratio * 100, 100);
  const color =
    kind === "revenue"
      ? ratio >= 1 ? "bg-success" : "bg-success/70"
      : ratio > 1 ? "bg-danger" : ratio >= 0.7 ? "bg-warning" : "bg-success";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={kind === "revenue" ? "Réalisation de l'objectif de recettes" : "Consommation du budget de la catégorie"}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <motion.div className={`h-full rounded-full ${color}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
    </div>
  );
}

const tabClass = (active: boolean) =>
  [
    "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
    active ? "bg-accent text-accent-fg shadow-card" : "text-fg-muted hover:text-fg",
  ].join(" ");

export default function BudgetSettingsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const queryClient = useQueryClient();

  const [catType, setCatType] = useState<CatType>("expense");
  const [budgetInput, setBudgetInput] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPlanned, setNewPlanned] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPlanned, setEditPlanned] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const L = LABELS[catType];

  const { data: company } = useQuery({ queryKey: ["company"], queryFn: async () => (await api.get<Company>("/companies/me")).data });
  const { data: categories, isLoading, isError } = useQuery({
    queryKey: ["categories", catType],
    queryFn: async () => (await api.get<Category[]>("/categories", { params: { type: catType } })).data,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
    void queryClient.invalidateQueries({ queryKey: ["company"] });
  };
  const onError = (err: unknown) => setError(apiErrorMessage(err));

  const saveBudget = useMutation({
    mutationFn: async (annual_budget: number) => (await api.patch("/companies/me", { annual_budget })).data,
    onSuccess: () => { setBudgetInput(null); refresh(); },
    onError,
  });
  const createCategory = useMutation({
    mutationFn: async () => (await api.post("/categories", { name: newName.trim(), planned_budget: Number(newPlanned) || 0, type: catType })).data,
    onSuccess: () => { setNewName(""); setNewPlanned(""); refresh(); },
    onError,
  });
  const updateCategory = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/categories/${id}`, { name: editName.trim(), planned_budget: Number(editPlanned) || 0 })).data,
    onSuccess: () => { setEditingId(null); refresh(); },
    onError,
  });
  const deleteCategory = useMutation({
    mutationFn: async (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => { setConfirmDeleteId(null); refresh(); },
    onError,
  });

  const cats = categories ?? [];
  const totalPlanned = cats.reduce((s, c) => s + c.planned_budget, 0);
  const totalConsumed = cats.reduce((s, c) => s + c.consumed, 0);
  const annual = company?.annual_budget ?? 0;
  const overAllocated = catType === "expense" && annual > 0 && totalPlanned > annual;

  function handleBudgetSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(budgetInput);
    if (Number.isNaN(value) || value < 0) { setError("Le budget annuel doit être un nombre positif."); return; }
    saveBudget.mutate(value);
  }
  function startEdit(cat: Category) {
    setError(null); setEditingId(cat.id); setEditName(cat.name); setEditPlanned(String(cat.planned_budget)); setConfirmDeleteId(null);
  }

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Budget &amp; catégories</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        {company?.name} — vos budgets de dépenses et vos objectifs de recettes, par catégorie.
      </p>

      {error && <ErrorBanner className="mt-4">{error}</ErrorBanner>}

      {/* Budget annuel — réservé aux admins : l'enveloppe globale ne concerne pas les utilisateurs. */}
      {isAdmin && (
        <section className="card mt-6 p-6">
          <h2 className="font-display text-base font-semibold text-fg">Budget annuel de dépenses</h2>
          <div className="mt-4 flex flex-wrap items-end gap-6">
            <div>
              <p className="font-display text-3xl font-bold tracking-tight tnum text-fg">{company ? fcfa(annual) : "…"}</p>
              <p className="mt-1 text-xs text-fg-subtle">L'enveloppe annuelle de dépenses de l'entreprise.</p>
            </div>
            <form onSubmit={handleBudgetSubmit} className="flex items-center gap-2">
              <input type="number" min={0} step="0.01" value={budgetInput ?? String(annual)} onChange={(e) => setBudgetInput(e.target.value)} className="field tnum w-44" aria-label="Budget annuel" />
              <motion.button type="submit" whileTap={{ scale: 0.98 }} disabled={saveBudget.isPending || budgetInput === null} className="btn btn-primary">
                {saveBudget.isPending ? "…" : "Enregistrer"}
              </motion.button>
            </form>
          </div>
        </section>
      )}

      {/* Catégories */}
      <section className="card mt-8 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-fg">{L.section}</h2>
          <div role="tablist" aria-label="Type de catégorie" className="inline-flex gap-1 rounded-xl bg-surface-2 p-1">
            {(["expense", "revenue"] as CatType[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={catType === t}
                onClick={() => { setCatType(t); setEditingId(null); setError(null); }}
                className={tabClass(catType === t)}
              >
                {t === "expense" ? "Dépenses" : "Recettes"}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-2 text-xs text-fg-subtle">
          {L.allocated} : <span className="tnum">{fcfa(totalPlanned)}</span> · {L.done} : <span className="tnum">{fcfa(totalConsumed)}</span>
        </p>
        {isAdmin && overAllocated && (
          <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-ink">
            Les budgets par catégorie (<span className="tnum">{fcfa(totalPlanned)}</span>) dépassent le budget annuel (<span className="tnum">{fcfa(annual)}</span>).
          </p>
        )}

        {isLoading && (
          <div aria-busy="true" className="mt-4 space-y-4">
            {Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} lines={1} />)}
          </div>
        )}
        {isError && <ErrorBanner className="mt-4">Impossible d'afficher les catégories. Réessayez.</ErrorBanner>}
        {categories?.length === 0 && (
          <p className="mt-4 text-sm text-fg-muted">Aucune catégorie pour l'instant.{isAdmin && L.emptyHint}</p>
        )}

        <ul className="mt-4 space-y-3">
          {cats.map((cat) => (
            <li key={cat.id} className="rounded-xl border border-line p-4">
              {editingId === cat.id ? (
                <form onSubmit={(e) => { e.preventDefault(); setError(null); updateCategory.mutate(cat.id); }} className="flex flex-wrap items-end gap-3">
                  <div className="min-w-40 flex-1">
                    <label className={labelClass}>Nom</label>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} required minLength={2} className="field" />
                  </div>
                  <div>
                    <label className={labelClass}>{L.planned}</label>
                    <input type="number" min={0} step="0.01" value={editPlanned} onChange={(e) => setEditPlanned(e.target.value)} required className="field tnum w-36" />
                  </div>
                  <button type="submit" disabled={updateCategory.isPending} className="btn btn-primary">Enregistrer</button>
                  <button type="button" onClick={() => setEditingId(null)} className="btn btn-ghost">Annuler</button>
                </form>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-fg">{cat.name}</p>
                    <div className="flex items-center gap-3">
                      <p className="text-sm tnum text-fg-muted">{fcfa(cat.consumed)} / {fcfa(cat.planned_budget)}</p>
                      {isAdmin && (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => startEdit(cat)} aria-label={`Modifier ${cat.name}`} className="btn btn-ghost px-2.5 py-1 text-xs">
                            <Pencil size={13} strokeWidth={2} /> Modifier
                          </button>
                          {confirmDeleteId === cat.id ? (
                            <button type="button" onClick={() => deleteCategory.mutate(cat.id)} disabled={deleteCategory.isPending} className="btn px-2.5 py-1 text-xs" style={{ backgroundColor: "var(--danger)", color: "var(--danger-fg)" }}>
                              Confirmer la suppression
                            </button>
                          ) : (
                            <button type="button" onClick={() => { setError(null); setConfirmDeleteId(cat.id); }} aria-label={`Supprimer ${cat.name}`} className="btn btn-danger px-2.5 py-1 text-xs">
                              <Trash2 size={13} strokeWidth={2} /> Supprimer
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3"><ProgressBar consumed={cat.consumed} planned={cat.planned_budget} kind={catType} /></div>
                </>
              )}
            </li>
          ))}
        </ul>

        {isAdmin && (
          <form onSubmit={(e) => { e.preventDefault(); setError(null); createCategory.mutate(); }} className="mt-6 flex flex-wrap items-end gap-3 border-t border-line pt-6">
            <div className="min-w-40 flex-1">
              <label htmlFor="newCatName" className={labelClass}>{L.newTitle}</label>
              <input id="newCatName" value={newName} onChange={(e) => setNewName(e.target.value)} required minLength={2} maxLength={80} className="field" placeholder={L.newPlaceholder} />
            </div>
            <div>
              <label htmlFor="newCatBudget" className={labelClass}>{L.planned}</label>
              <input id="newCatBudget" type="number" min={0} step="0.01" value={newPlanned} onChange={(e) => setNewPlanned(e.target.value)} required className="field tnum w-36" />
            </div>
            <motion.button type="submit" whileTap={{ scale: 0.98 }} disabled={createCategory.isPending} className="btn btn-primary">
              <Plus size={16} strokeWidth={2.25} /> {createCategory.isPending ? "Création…" : "Ajouter"}
            </motion.button>
          </form>
        )}
      </section>
    </div>
  );
}
