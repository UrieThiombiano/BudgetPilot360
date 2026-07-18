/**
 * Écran générique « mes transactions » — factorise dépenses ET recettes.
 * Un `TxConfig` paramètre libellés, endpoint, champ de date, présence d'une
 * source / de commentaires. `MesDepenses` et `MesRecettes` en sont des instances.
 */
import { useRef, useState, type ComponentType, type FormEvent } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Paperclip, type LucideProps } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
import { CardSkeleton, EmptyState, ErrorBanner, SuccessBanner } from "./ui";
import { fcfa } from "../lib/format";

export type TxKind = "expense" | "revenue";
export type TxStatus = "pending" | "approved" | "rejected";

export interface TxConfig {
  kind: TxKind;
  endpoint: string;
  minesKey: string[];
  dateField: string;
  proofFlag: string;
  proofRoute: string;
  hasSource: boolean;
  hasComments: boolean;
  icon: ComponentType<LucideProps>;
  title: string;
  subtitle: string;
  newLabel: string;
  submitLabel: string;
  successMessage: string;
  emptyTitle: string;
  emptyDescription: string;
  historyErrorText: string;
  noCategoryText: string;
  descPlaceholder: string;
  amountPlaceholder: string;
  sourceLabel?: string;
  sourcePlaceholder?: string;
}

interface Category { id: string; name: string }
interface Comment { id: string; author_name: string | null; content: string; created_at: string | null }

const labelClass = "mb-1.5 block text-xs font-medium text-fg-muted";

export function statusBadge(status: TxStatus, kind: TxKind) {
  const approvedLabel = kind === "revenue" ? "Confirmée" : "Approuvée";
  return {
    pending: { label: "En validation", cls: "bg-warning-soft text-warning-ink" },
    approved: { label: approvedLabel, cls: "bg-success-soft text-success-ink" },
    rejected: { label: "Refusée", cls: "bg-danger-soft text-danger-ink" },
  }[status];
}

function Comments({ endpoint }: { endpoint: string }) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: comments, isLoading } = useQuery({
    queryKey: ["comments", endpoint],
    queryFn: async () => (await api.get<Comment[]>(`${endpoint}/comments`)).data,
  });

  const addComment = useMutation({
    mutationFn: async () => (await api.post(`${endpoint}/comments`, { content: content.trim() })).data,
    onSuccess: () => {
      setContent("");
      void queryClient.invalidateQueries({ queryKey: ["comments", endpoint] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  return (
    <div className="mt-3 border-t border-line pt-3">
      {isLoading && (
        <div className="space-y-2">
          {[0, 1].map((i) => <div key={i} className="h-3 w-40 animate-pulse rounded bg-surface-2" />)}
        </div>
      )}
      <ul className="space-y-2">
        {(comments ?? []).map((cm) => (
          <li key={cm.id} className="text-sm">
            <span className="font-medium text-fg">{cm.author_name ?? "Membre"}</span>{" "}
            <span className="text-xs text-fg-subtle">
              {cm.created_at ? new Date(cm.created_at).toLocaleString("fr-FR") : ""}
            </span>
            <p className="text-fg-muted">{cm.content}</p>
          </li>
        ))}
        {comments?.length === 0 && <li className="text-xs text-fg-subtle">Soyez le premier à commenter.</li>}
      </ul>
      {error && <ErrorBanner className="mt-2">{error}</ErrorBanner>}
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
          className="field"
        />
        <motion.button
          type="submit"
          whileTap={{ scale: 0.97 }}
          disabled={addComment.isPending || !content.trim()}
          className="btn btn-primary"
        >
          Envoyer
        </motion.button>
      </form>
    </div>
  );
}

export default function TransactionsPage({ config }: { config: TxConfig }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["categories", config.kind],
    queryFn: async () => (await api.get<Category[]>("/categories", { params: { type: config.kind } })).data,
  });

  const { data: items, isLoading, isError } = useQuery({
    queryKey: config.minesKey,
    queryFn: async () => (await api.get<Record<string, unknown>[]>(`${config.endpoint}/mine`)).data,
  });

  const createTx = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        amount: Number(amount),
        category_id: categoryId,
        [config.dateField]: date,
        description: description.trim() || null,
      };
      if (config.hasSource) payload.source = source.trim() || null;
      const { data: created } = await api.post<{ id: string }>(config.endpoint, payload);
      const file = fileRef.current?.files?.[0];
      if (file) {
        const form = new FormData();
        form.append("file", file);
        await api.post(`${config.endpoint}/${created.id}/${config.proofRoute}`, form);
      }
      return created;
    },
    onSuccess: () => {
      setAmount("");
      setDescription("");
      setSource("");
      setDate(today);
      if (fileRef.current) fileRef.current.value = "";
      setSuccessMessage(config.successMessage);
      void queryClient.invalidateQueries({ queryKey: config.minesKey });
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  const openProof = async (id: string) => {
    try {
      const { data } = await api.get<{ url: string }>(`${config.endpoint}/${id}/${config.proofRoute}`);
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
    createTx.mutate();
  }

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{config.title}</h1>
      <p className="mt-1.5 text-sm text-fg-muted">{config.subtitle}</p>

      {/* Formulaire de création */}
      <section className="card mt-6 p-6">
        <h2 className="font-display text-base font-semibold text-fg">{config.newLabel}</h2>
        {categories?.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">{config.noCategoryText}</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="txAmount" className={labelClass}>Montant (FCFA)</label>
                <input id="txAmount" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="field tnum" placeholder={config.amountPlaceholder} />
              </div>
              <div>
                <label htmlFor="txDate" className={labelClass}>Date</label>
                <input id="txDate" type="date" required value={date} max={today} onChange={(e) => setDate(e.target.value)} className="field" />
              </div>
              <div>
                <label htmlFor="txCategory" className={labelClass}>Catégorie</label>
                <select id="txCategory" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="field">
                  <option value="">Sélectionner une catégorie</option>
                  {(categories ?? []).map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
            </div>
            {config.hasSource && (
              <div>
                <label htmlFor="txSource" className={labelClass}>{config.sourceLabel}</label>
                <input id="txSource" value={source} onChange={(e) => setSource(e.target.value)} maxLength={200} className="field" placeholder={config.sourcePlaceholder} />
              </div>
            )}
            <div>
              <label htmlFor="txDesc" className={labelClass}>Description</label>
              <input id="txDesc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className="field" placeholder={config.descPlaceholder} />
            </div>
            <div>
              <label htmlFor="txFile" className={labelClass}>Justificatif (PDF, PNG, JPEG, WebP — 10 Mo max)</label>
              <input id="txFile" ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" className="block w-full text-sm text-fg-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent-ink hover:file:brightness-95" />
            </div>

            {formError && <ErrorBanner>{formError}</ErrorBanner>}
            {successMessage && <SuccessBanner>{successMessage}</SuccessBanner>}

            <motion.button type="submit" whileTap={{ scale: 0.985 }} disabled={createTx.isPending} className="btn btn-primary">
              {createTx.isPending ? "Envoi…" : config.submitLabel}
            </motion.button>
          </form>
        )}
      </section>

      {/* Historique */}
      <section className="mt-8 space-y-3">
        <h2 className="font-display text-base font-semibold text-fg">Historique</h2>
        {isLoading && (
          <div aria-busy="true" className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} lines={1} />)}
          </div>
        )}
        {isError && <ErrorBanner>{config.historyErrorText}</ErrorBanner>}
        {items?.length === 0 && (
          <EmptyState icon={config.icon} title={config.emptyTitle} description={config.emptyDescription} />
        )}
        {(items ?? []).map((raw, index) => {
          const status = raw.status as TxStatus;
          const badge = statusBadge(status, config.kind);
          const id = raw.id as string;
          const hasProof = Boolean(raw[config.proofFlag]);
          const src = raw.source as string | null | undefined;
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
              className="card p-4 transition-shadow hover:shadow-elevated"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-fg">
                    <span className="tnum">{fcfa(raw.amount as number)}</span>{" "}
                    <span className="text-sm font-normal text-fg-muted">
                      · {(raw.category_name as string) ?? "Catégorie supprimée"} ·{" "}
                      {new Date(raw[config.dateField] as string).toLocaleDateString("fr-FR")}
                    </span>
                  </p>
                  {src && <p className="text-sm text-fg-muted">Source : {src}</p>}
                  {(raw.description as string) && <p className="text-sm text-fg-muted">{raw.description as string}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                  {hasProof && (
                    <button type="button" onClick={() => void openProof(id)} className="btn btn-ghost px-2.5 py-1 text-xs">
                      <Paperclip size={14} strokeWidth={2} /> Justificatif
                    </button>
                  )}
                  {config.hasComments && (
                    <button type="button" onClick={() => setOpenComments(openComments === id ? null : id)} className="btn btn-ghost px-2.5 py-1 text-xs">
                      <MessageSquare size={14} strokeWidth={2} /> Commentaires
                    </button>
                  )}
                </div>
              </div>
              {status === "rejected" && (raw.rejection_reason as string) && (
                <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
                  Motif du refus : {raw.rejection_reason as string}
                </p>
              )}
              {config.hasComments && openComments === id && <Comments endpoint={`${config.endpoint}/${id}`} />}
            </motion.div>
          );
        })}
      </section>
    </div>
  );
}
