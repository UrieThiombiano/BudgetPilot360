import { useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
import { CardSkeleton, ErrorBanner, Skeleton, SuccessBanner } from "../components/ui";
import { fcfa } from "../lib/format";

interface PlatformCompany {
  id: string;
  name: string;
  created_at: string | null;
  subscription_status: "active" | "suspended";
  plan: string;
  subscription_ends_at: string | null;
  users_count: number;
}

interface PlatformStats {
  companies_count: number;
  active_companies: number;
  suspended_companies: number;
  users_count: number;
  expenses_count: number;
  approved_amount: number;
  pending_requests: number;
  new_requests_today: number;
  expiring_soon: number;
  plans: Record<string, number>;
}

interface RegistrationRequest {
  id: string;
  company_name: string;
  industry: string;
  contact_name: string;
  email: string;
  phone: string;
  city: string;
  employees_count: number | null;
  message: string | null;
  status: "pending" | "approved" | "rejected";
  plan: string | null;
  rejection_reason: string | null;
  created_at: string | null;
}

const PLANS = ["starter", "standard", "premium"] as const;
const planLabel: Record<string, string> = {
  starter: "Starter",
  standard: "Standard",
  premium: "Premium",
};

const frDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";

const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

const cardClass =
  "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <motion.div variants={itemVariants} className={cardClass}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </motion.div>
  );
}

function StatusBadge({ status }: { status: PlatformCompany["subscription_status"] }) {
  return status === "active" ? (
    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
      Actif
    </span>
  ) : (
    <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
      Suspendu
    </span>
  );
}

function RequestStatusBadge({ status }: { status: RegistrationRequest["status"] }) {
  const styles = {
    pending: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    rejected: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  };
  const labels = { pending: "En attente", approved: "Validée", rejected: "Refusée" };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

/** Panneau d'examen d'une demande : offre + durée + note → approbation, ou motif → refus. */
function ReviewPanel({
  request,
  onDone,
  onError,
}: {
  request: RegistrationRequest;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<(typeof PLANS)[number]>("starter");
  const [months, setMonths] = useState("12");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  const review = useMutation({
    mutationFn: async (action: "approve" | "reject") =>
      (
        await api.post(`/registration/requests/${request.id}/review`, {
          action,
          plan: action === "approve" ? plan : null,
          subscription_months: action === "approve" ? Number(months) : null,
          internal_note: note.trim(),
          rejection_reason: reason.trim(),
        })
      ).data,
    onSuccess: (_data, action) => {
      onDone(
        action === "approve"
          ? `Demande validée — tenant créé, email d'activation envoyé à ${request.email}.`
          : "Demande refusée et archivée — aucun tenant créé."
      );
      void queryClient.invalidateQueries({ queryKey: ["registration-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
    },
    onError: (err) => onError(apiErrorMessage(err)),
  });

  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
        <p>📞 {request.phone}</p>
        <p>📍 {request.city}</p>
        <p>🏭 {request.industry}</p>
        <p>👥 {request.employees_count ?? "?"} employé(s)</p>
      </div>
      {request.message && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          « {request.message} »
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`plan-${request.id}`} className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Offre
          </label>
          <select
            id={`plan-${request.id}`}
            value={plan}
            onChange={(e) => setPlan(e.target.value as (typeof PLANS)[number])}
            className={inputClass}
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {planLabel[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`months-${request.id}`} className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Durée (mois)
          </label>
          <input
            id={`months-${request.id}`}
            type="number"
            min={1}
            max={60}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            className={`${inputClass} w-28`}
          />
        </div>
        <div className="min-w-48 flex-1">
          <label htmlFor={`note-${request.id}`} className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Note interne (jamais visible par le demandeur)
          </label>
          <input
            id={`note-${request.id}`}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={`${inputClass} w-full`}
            placeholder="Ex : contacté par téléphone le…"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          disabled={review.isPending || !(Number(months) >= 1)}
          onClick={() => review.mutate("approve")}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {review.isPending ? "…" : "✓ Approuver et créer le tenant"}
        </button>
        <div className="flex min-w-64 flex-1 items-end gap-2">
          <div className="flex-1">
            <label htmlFor={`reason-${request.id}`} className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Motif du refus (optionnel)
            </label>
            <input
              id={`reason-${request.id}`}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>
          <button
            type="button"
            disabled={review.isPending}
            onClick={() => review.mutate("reject")}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            ✕ Refuser
          </button>
        </div>
      </div>
    </div>
  );
}

/** Espace Super Admin (Pukri) — le backend re-vérifie role == super_admin partout. */
export default function PlatformPage() {
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => (await api.get<PlatformStats>("/platform/stats")).data,
  });

  const { data: requests, isLoading: requestsLoading } = useQuery({
    queryKey: ["registration-requests"],
    queryFn: async () =>
      (await api.get<RegistrationRequest[]>("/registration/requests")).data,
  });

  const { data: companies, isLoading, isError } = useQuery({
    queryKey: ["platform-companies"],
    queryFn: async () => (await api.get<PlatformCompany[]>("/platform/companies")).data,
  });

  const setSubscription = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "activate" | "suspend" }) =>
      (await api.post(`/platform/companies/${id}/subscription`, { action })).data,
    onSuccess: () => {
      setConfirmId(null);
      void queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-stats"] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const plansHint = stats
    ? Object.entries(stats.plans)
        .map(([p, n]) => `${planLabel[p] ?? p} : ${n}`)
        .join(" · ") || "aucune offre"
    : undefined;

  const pendingRequests = (requests ?? []).filter((r) => r.status === "pending");
  const processedRequests = (requests ?? []).filter((r) => r.status !== "pending");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
        Plateforme — Espace Pukri
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Demandes d'inscription, entreprises clientes et abonnements BudgetPilot360.
      </p>

      {error && <ErrorBanner className="mt-4">{error}</ErrorBanner>}
      {message && <SuccessBanner className="mt-4">{message}</SuccessBanner>}

      {/* Indicateurs */}
      {statsLoading && (
        <div aria-busy="true" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}
      {!statsLoading && stats && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <StatCard
            label="Demandes en attente"
            value={String(stats.pending_requests)}
            hint={`${stats.new_requests_today} nouvelle(s) aujourd'hui`}
          />
          <StatCard
            label="Entreprises clientes"
            value={String(stats.companies_count)}
            hint={`${stats.active_companies} active(s) · ${stats.suspended_companies} suspendue(s)`}
          />
          <StatCard
            label="Abonnements expirant"
            value={String(stats.expiring_soon)}
            hint="sous 30 jours"
          />
          <StatCard
            label="Volume traité"
            value={fcfa(stats.approved_amount)}
            hint={plansHint}
          />
        </motion.div>
      )}

      {/* Demandes d'inscription */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className={`${cardClass} mt-6`}
      >
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Demandes d'inscription
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Le tenant n'est créé qu'à l'approbation — le responsable reçoit alors un
          email d'activation et choisit lui-même son mot de passe.
        </p>

        {requestsLoading && (
          <div aria-busy="true" className="mt-4 space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {requests && requests.length === 0 && (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Aucune demande pour l'instant.
          </p>
        )}

        <div className="mt-4 space-y-3">
          {pendingRequests.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-amber-200 p-4 dark:border-amber-900/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {r.company_name}{" "}
                    <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                      · {r.industry} · {r.city}
                    </span>
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {r.contact_name} — {r.email} · demande du {frDate(r.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <RequestStatusBadge status={r.status} />
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setMessage(null);
                      setOpenRequestId(openRequestId === r.id ? null : r.id);
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {openRequestId === r.id ? "Fermer" : "Examiner"}
                  </button>
                </div>
              </div>
              {openRequestId === r.id && (
                <ReviewPanel
                  request={r}
                  onDone={(msg) => {
                    setOpenRequestId(null);
                    setMessage(msg);
                  }}
                  onError={(msg) => setError(msg)}
                />
              )}
            </div>
          ))}

          {processedRequests.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800"
            >
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-medium text-slate-900 dark:text-white">
                  {r.company_name}
                </span>{" "}
                · {r.contact_name} · {frDate(r.created_at)}
                {r.status === "rejected" && r.rejection_reason && (
                  <span className="text-slate-400"> — {r.rejection_reason}</span>
                )}
                {r.status === "approved" && r.plan && (
                  <span className="text-slate-400"> — offre {planLabel[r.plan] ?? r.plan}</span>
                )}
              </p>
              <RequestStatusBadge status={r.status} />
            </div>
          ))}
        </div>
      </motion.section>

      {/* Entreprises clientes */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15 }}
        className={`${cardClass} mt-6 overflow-x-auto`}
      >
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Entreprises clientes
        </h2>

        {isLoading && (
          <div aria-busy="true" className="mt-4 space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}
        {isError && (
          <ErrorBanner className="mt-4">
            Impossible de charger les entreprises. Réessayez.
          </ErrorBanner>
        )}

        {companies && companies.length === 0 && (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Aucune entreprise cliente pour l'instant.
          </p>
        )}

        {companies && companies.length > 0 && (
          <table className="mt-4 w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="pb-2 font-medium">Entreprise</th>
                <th className="pb-2 font-medium">Créée le</th>
                <th className="pb-2 font-medium">Utilisateurs</th>
                <th className="pb-2 font-medium">Offre</th>
                <th className="pb-2 font-medium">Expire le</th>
                <th className="pb-2 font-medium">Abonnement</th>
                <th className="pb-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const suspending = c.subscription_status === "active";
                return (
                  <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-3 font-medium text-slate-900 dark:text-white">{c.name}</td>
                    <td className="py-3 text-slate-600 dark:text-slate-300">{frDate(c.created_at)}</td>
                    <td className="py-3 text-slate-600 dark:text-slate-300">{c.users_count}</td>
                    <td className="py-3 text-slate-600 dark:text-slate-300">
                      {planLabel[c.plan] ?? c.plan}
                    </td>
                    <td className="py-3 text-slate-600 dark:text-slate-300">
                      {frDate(c.subscription_ends_at)}
                    </td>
                    <td className="py-3">
                      <StatusBadge status={c.subscription_status} />
                    </td>
                    <td className="py-3 text-right">
                      {confirmId === c.id ? (
                        <span className="inline-flex gap-2">
                          <button
                            type="button"
                            disabled={setSubscription.isPending}
                            onClick={() =>
                              setSubscription.mutate({
                                id: c.id,
                                action: suspending ? "suspend" : "activate",
                              })
                            }
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60 ${
                              suspending ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
                            }`}
                          >
                            Confirmer {suspending ? "la suspension" : "la réactivation"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setConfirmId(c.id);
                          }}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                            suspending
                              ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                              : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                          }`}
                        >
                          {suspending ? "Suspendre" : "Réactiver"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </motion.section>
    </div>
  );
}
