import { useRef, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
import { CardSkeleton, ErrorBanner, SuccessBanner } from "../components/ui";
import { fcfa } from "../lib/format";

interface Category {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  amount: number;
  expense_date: string;
  description: string | null;
  status: "pending" | "approved" | "rejected";
  category_name: string | null;
  has_receipt: boolean;
  rejection_reason: string | null;
}

interface Comment {
  id: string;
  author_name: string | null;
  content: string;
  created_at: string | null;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

const statusBadge: Record<Expense["status"], { label: string; cls: string }> = {
  pending: {
    label: "En attente",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  approved: {
    label: "Approuvée",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  rejected: {
    label: "Rejetée",
    cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
};

function ExpenseComments({ expenseId }: { expenseId: string }) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: comments, isLoading } = useQuery({
    queryKey: ["comments", expenseId],
    queryFn: async () =>
      (await api.get<Comment[]>(`/expenses/${expenseId}/comments`)).data,
  });

  const addComment = useMutation({
    mutationFn: async () =>
      (await api.post(`/expenses/${expenseId}/comments`, { content: content.trim() })).data,
    onSuccess: () => {
      setContent("");
      void queryClient.invalidateQueries({ queryKey: ["comments", expenseId] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      {isLoading && (
        <p className="text-xs text-slate-400 dark:text-slate-500">Chargement…</p>
      )}
      <ul className="space-y-2">
        {(comments ?? []).map((c) => (
          <li key={c.id} className="text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {c.author_name ?? "Membre"}
            </span>{" "}
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {c.created_at ? new Date(c.created_at).toLocaleString("fr-FR") : ""}
            </span>
            <p className="text-slate-600 dark:text-slate-400">{c.content}</p>
          </li>
        ))}
        {comments?.length === 0 && (
          <li className="text-xs text-slate-400 dark:text-slate-500">
            Aucun commentaire.
          </li>
        )}
      </ul>
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (content.trim()) addComment.mutate();
        }}
        className="mt-2 flex gap-2"
      >
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={1000}
          placeholder="Ajouter un commentaire…"
          aria-label="Ajouter un commentaire"
          className={inputClass}
        />
        <button
          type="submit"
          disabled={addComment.isPending || !content.trim()}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}

export default function MyExpensesPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await api.get<Category[]>("/categories")).data,
  });

  const { data: expenses, isLoading, isError } = useQuery({
    queryKey: ["my-expenses"],
    queryFn: async () => (await api.get<Expense[]>("/expenses/mine")).data,
  });

  const createExpense = useMutation({
    mutationFn: async () => {
      const { data: created } = await api.post<Expense>("/expenses", {
        amount: Number(amount),
        category_id: categoryId,
        expense_date: date,
        description: description.trim() || null,
      });
      const file = fileRef.current?.files?.[0];
      if (file) {
        const form = new FormData();
        form.append("file", file);
        await api.post(`/expenses/${created.id}/receipt`, form);
      }
      return created;
    },
    onSuccess: () => {
      setAmount("");
      setDescription("");
      setDate(today);
      if (fileRef.current) fileRef.current.value = "";
      setSuccessMessage("Dépense soumise — en attente d'approbation par votre admin.");
      void queryClient.invalidateQueries({ queryKey: ["my-expenses"] });
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  const openReceipt = async (expenseId: string) => {
    try {
      const { data } = await api.get<{ url: string }>(`/expenses/${expenseId}/receipt`);
      window.open(data.url, "_blank", "noopener");
    } catch (err) {
      setFormError(apiErrorMessage(err));
    }
  };

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    if (!categoryId) {
      setFormError("Choisissez une catégorie.");
      return;
    }
    if (!(Number(amount) > 0)) {
      setFormError("Le montant doit être supérieur à 0.");
      return;
    }
    createExpense.mutate();
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
        Mes dépenses
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Soumettez vos dépenses avec justificatif — votre admin les approuve ou les rejette.
      </p>

      {/* Formulaire de création */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Nouvelle dépense
        </h2>
        {categories?.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Aucune catégorie disponible — demandez à votre admin d'en créer dans
            « Paramètres budget ».
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="expAmount" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Montant (FCFA)
                </label>
                <input
                  id="expAmount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClass}
                  placeholder="25000"
                />
              </div>
              <div>
                <label htmlFor="expDate" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Date
                </label>
                <input
                  id="expDate"
                  type="date"
                  required
                  value={date}
                  max={today}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="expCategory" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Catégorie
                </label>
                <select
                  id="expCategory"
                  required
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— Choisir —</option>
                  {(categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="expDesc" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Description
              </label>
              <input
                id="expDesc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                className={inputClass}
                placeholder="Ex : taxi aéroport, déjeuner client…"
              />
            </div>
            <div>
              <label htmlFor="expFile" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Justificatif (PDF, PNG, JPEG, WebP — 10 Mo max)
              </label>
              <input
                id="expFile"
                ref={fileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-slate-400 dark:file:bg-slate-800 dark:file:text-indigo-300"
              />
            </div>

            {formError && <ErrorBanner>{formError}</ErrorBanner>}
            {successMessage && <SuccessBanner>{successMessage}</SuccessBanner>}

            <button
              type="submit"
              disabled={createExpense.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {createExpense.isPending ? "Envoi…" : "Soumettre la dépense"}
            </button>
          </form>
        )}
      </section>

      {/* Liste des dépenses */}
      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Historique
        </h2>
        {isLoading && (
          <div aria-busy="true" className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <CardSkeleton key={i} lines={1} />
            ))}
          </div>
        )}
        {isError && (
          <ErrorBanner>
            Impossible de charger vos dépenses. Vérifiez votre connexion puis réessayez.
          </ErrorBanner>
        )}
        {expenses?.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aucune dépense soumise pour l'instant.
          </p>
        )}
        {(expenses ?? []).map((exp, index) => {
          const badge = statusBadge[exp.status];
          return (
            <motion.div
              key={exp.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {fcfa(exp.amount)}{" "}
                    <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                      · {exp.category_name ?? "Catégorie supprimée"} ·{" "}
                      {new Date(exp.expense_date).toLocaleDateString("fr-FR")}
                    </span>
                  </p>
                  {exp.description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {exp.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                  {exp.has_receipt && (
                    <button
                      type="button"
                      onClick={() => void openReceipt(exp.id)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      📎 Justificatif
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setOpenComments(openComments === exp.id ? null : exp.id)
                    }
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    💬 Commentaires
                  </button>
                </div>
              </div>
              {exp.status === "rejected" && exp.rejection_reason && (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
                  Motif du rejet : {exp.rejection_reason}
                </p>
              )}
              {openComments === exp.id && <ExpenseComments expenseId={exp.id} />}
            </motion.div>
          );
        })}
      </section>
    </div>
  );
}
