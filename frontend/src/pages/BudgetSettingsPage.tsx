import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { CardSkeleton, ErrorBanner } from "../components/ui";
import { fcfa } from "../lib/format";

interface Company {
  id: string;
  name: string;
  annual_budget: number;
}

interface Category {
  id: string;
  name: string;
  planned_budget: number;
  consumed: number;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

function ProgressBar({ consumed, planned }: { consumed: number; planned: number }) {
  const ratio = planned > 0 ? consumed / planned : consumed > 0 ? 1.01 : 0;
  const pct = Math.min(ratio * 100, 100);
  const color =
    ratio > 1 ? "bg-red-500" : ratio >= 0.7 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Consommation du budget de la catégorie"
      className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
    >
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function BudgetSettingsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const queryClient = useQueryClient();

  const [budgetInput, setBudgetInput] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPlanned, setNewPlanned] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPlanned, setEditPlanned] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: company } = useQuery({
    queryKey: ["company"],
    queryFn: async () => (await api.get<Company>("/companies/me")).data,
  });

  const { data: categories, isLoading, isError } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await api.get<Category[]>("/categories")).data,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
    void queryClient.invalidateQueries({ queryKey: ["company"] });
  };

  const onError = (err: unknown) => setError(apiErrorMessage(err));

  const saveBudget = useMutation({
    mutationFn: async (annual_budget: number) =>
      (await api.patch("/companies/me", { annual_budget })).data,
    onSuccess: () => {
      setBudgetInput(null);
      refresh();
    },
    onError,
  });

  const createCategory = useMutation({
    mutationFn: async () =>
      (
        await api.post("/categories", {
          name: newName.trim(),
          planned_budget: Number(newPlanned) || 0,
        })
      ).data,
    onSuccess: () => {
      setNewName("");
      setNewPlanned("");
      refresh();
    },
    onError,
  });

  const updateCategory = useMutation({
    mutationFn: async (id: string) =>
      (
        await api.patch(`/categories/${id}`, {
          name: editName.trim(),
          planned_budget: Number(editPlanned) || 0,
        })
      ).data,
    onSuccess: () => {
      setEditingId(null);
      refresh();
    },
    onError,
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      setConfirmDeleteId(null);
      refresh();
    },
    onError,
  });

  const totalPlanned = (categories ?? []).reduce((s, c) => s + c.planned_budget, 0);
  const totalConsumed = (categories ?? []).reduce((s, c) => s + c.consumed, 0);
  const annual = company?.annual_budget ?? 0;
  const overAllocated = annual > 0 && totalPlanned > annual;

  function handleBudgetSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(budgetInput);
    if (Number.isNaN(value) || value < 0) {
      setError("Le budget annuel doit être un nombre positif.");
      return;
    }
    saveBudget.mutate(value);
  }

  function startEdit(cat: Category) {
    setError(null);
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditPlanned(String(cat.planned_budget));
    setConfirmDeleteId(null);
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
        Paramètres budget
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {company?.name} — budget annuel et postes de dépense.
      </p>

      {error && <ErrorBanner className="mt-4">{error}</ErrorBanner>}

      {/* Budget annuel */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Budget annuel
        </h2>
        <div className="mt-4 flex flex-wrap items-end gap-6">
          <div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {company ? fcfa(annual) : "…"}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Alloué aux catégories : {fcfa(totalPlanned)} · Consommé : {fcfa(totalConsumed)}
            </p>
          </div>
          {isAdmin && (
            <form onSubmit={handleBudgetSubmit} className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step="0.01"
                value={budgetInput ?? String(annual)}
                onChange={(e) => setBudgetInput(e.target.value)}
                className={`${inputClass} w-44`}
                aria-label="Budget annuel"
              />
              <button
                type="submit"
                disabled={saveBudget.isPending || budgetInput === null}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saveBudget.isPending ? "…" : "Enregistrer"}
              </button>
            </form>
          )}
        </div>
        {overAllocated && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            Les budgets par catégorie ({fcfa(totalPlanned)}) dépassent le budget annuel ({fcfa(annual)}).
          </p>
        )}
      </section>

      {/* Catégories */}
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Catégories de dépenses
        </h2>

        {isLoading && (
          <div aria-busy="true" className="mt-4 space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <CardSkeleton key={i} lines={1} className="border-slate-100 dark:border-slate-800" />
            ))}
          </div>
        )}
        {isError && (
          <ErrorBanner className="mt-4">
            Impossible de charger les catégories. Réessayez.
          </ErrorBanner>
        )}
        {categories?.length === 0 && (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Aucune catégorie pour l'instant.
            {isAdmin && " Créez votre premier poste de dépense ci-dessous."}
          </p>
        )}

        <ul className="mt-4 space-y-4">
          {(categories ?? []).map((cat) => (
            <li
              key={cat.id}
              className="rounded-xl border border-slate-100 p-4 dark:border-slate-800"
            >
              {editingId === cat.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError(null);
                    updateCategory.mutate(cat.id);
                  }}
                  className="flex flex-wrap items-end gap-3"
                >
                  <div className="min-w-40 flex-1">
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Nom
                    </label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                      minLength={2}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Budget prévu (FCFA)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editPlanned}
                      onChange={(e) => setEditPlanned(e.target.value)}
                      required
                      className={`${inputClass} w-36`}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={updateCategory.isPending}
                    className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Annuler
                  </button>
                </form>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-900 dark:text-white">{cat.name}</p>
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {fcfa(cat.consumed)} / {fcfa(cat.planned_budget)}
                      </p>
                      {isAdmin && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(cat)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            Modifier
                          </button>
                          {confirmDeleteId === cat.id ? (
                            <button
                              type="button"
                              onClick={() => deleteCategory.mutate(cat.id)}
                              disabled={deleteCategory.isPending}
                              className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              Confirmer ?
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setError(null);
                                setConfirmDeleteId(cat.id);
                              }}
                              className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3">
                    <ProgressBar consumed={cat.consumed} planned={cat.planned_budget} />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>

        {/* Création (admin) */}
        {isAdmin && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              createCategory.mutate();
            }}
            className="mt-6 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-6 dark:border-slate-800"
          >
            <div className="min-w-40 flex-1">
              <label htmlFor="newCatName" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Nouvelle catégorie
              </label>
              <input
                id="newCatName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                minLength={2}
                maxLength={80}
                className={inputClass}
                placeholder="Ex : Transport, Carburant, Salaires…"
              />
            </div>
            <div>
              <label htmlFor="newCatBudget" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Budget prévu (FCFA)
              </label>
              <input
                id="newCatBudget"
                type="number"
                min={0}
                step="0.01"
                value={newPlanned}
                onChange={(e) => setNewPlanned(e.target.value)}
                required
                className={`${inputClass} w-36`}
              />
            </div>
            <button
              type="submit"
              disabled={createCategory.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {createCategory.isPending ? "Création…" : "Ajouter"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
