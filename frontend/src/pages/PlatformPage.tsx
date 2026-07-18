import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Factory, MapPin, Phone, Users, X } from "lucide-react";
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
  job_title: string | null;
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
const planLabel: Record<string, string> = { starter: "Starter", standard: "Standard", premium: "Premium" };
const frDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "Non précisée");

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };
const labelClass = "mb-1 block text-xs font-medium text-fg-muted";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <motion.div variants={item} className="card p-5 transition-shadow hover:shadow-elevated">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tracking-tight tnum text-fg">{value}</p>
      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </motion.div>
  );
}

const badgeBase = "rounded-full px-2.5 py-0.5 text-xs font-semibold";
function StatusBadge({ status }: { status: PlatformCompany["subscription_status"] }) {
  return status === "active" ? (
    <span className={`${badgeBase} bg-success-soft text-success-ink`}>Actif</span>
  ) : (
    <span className={`${badgeBase} bg-danger-soft text-danger-ink`}>Suspendu</span>
  );
}
function RequestStatusBadge({ status }: { status: RegistrationRequest["status"] }) {
  const styles = {
    pending: "bg-warning-soft text-warning-ink",
    approved: "bg-success-soft text-success-ink",
    rejected: "bg-danger-soft text-danger-ink",
  };
  const labels = { pending: "En attente", approved: "Validée", rejected: "Refusée" };
  return <span className={`${badgeBase} ${styles[status]}`}>{labels[status]}</span>;
}

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
      (await api.post(`/registration/requests/${request.id}/review`, {
        action,
        plan: action === "approve" ? plan : null,
        subscription_months: action === "approve" ? Number(months) : null,
        internal_note: note.trim(),
        rejection_reason: reason.trim(),
      })).data,
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

  const meta = [
    { icon: Phone, text: request.phone },
    { icon: MapPin, text: request.city },
    { icon: Factory, text: request.industry },
    { icon: Users, text: request.employees_count ? `${request.employees_count} employé(s)` : "Effectif non précisé" },
  ];

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      <div className="grid gap-2 text-sm text-fg-muted sm:grid-cols-2">
        {meta.map(({ icon: Icon, text }, i) => (
          <p key={i} className="flex items-center gap-2">
            <Icon size={14} strokeWidth={2} className="text-fg-subtle" /> {text}
          </p>
        ))}
      </div>
      {request.message && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg-muted">« {request.message} »</p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`plan-${request.id}`} className={labelClass}>Offre</label>
          <select id={`plan-${request.id}`} value={plan} onChange={(e) => setPlan(e.target.value as (typeof PLANS)[number])} className="field">
            {PLANS.map((p) => <option key={p} value={p}>{planLabel[p]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`months-${request.id}`} className={labelClass}>Durée (mois)</label>
          <input id={`months-${request.id}`} type="number" min={1} max={60} value={months} onChange={(e) => setMonths(e.target.value)} className="field tnum w-28" />
        </div>
        <div className="min-w-48 flex-1">
          <label htmlFor={`note-${request.id}`} className={labelClass}>Note interne (jamais visible par le demandeur)</label>
          <input id={`note-${request.id}`} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className="field" placeholder="Ex : contacté par téléphone le…" />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          disabled={review.isPending || !(Number(months) >= 1)}
          onClick={() => review.mutate("approve")}
          className="btn px-4 py-2 text-sm"
          style={{ backgroundColor: "var(--success)", color: "var(--success-fg)" }}
        >
          <Check size={15} strokeWidth={2.25} /> {review.isPending ? "…" : "Approuver et créer le tenant"}
        </button>
        <div className="flex min-w-64 flex-1 items-end gap-2">
          <div className="flex-1">
            <label htmlFor={`reason-${request.id}`} className={labelClass}>Motif du refus (facultatif)</label>
            <input id={`reason-${request.id}`} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="field" />
          </div>
          <button type="button" disabled={review.isPending} onClick={() => review.mutate("reject")} className="btn btn-danger px-4 py-2 text-sm">
            <X size={15} strokeWidth={2.25} /> Refuser
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
    queryFn: async () => (await api.get<RegistrationRequest[]>("/registration/requests")).data,
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
    ? Object.entries(stats.plans).map(([p, n]) => `${planLabel[p] ?? p} : ${n}`).join(" · ") || "aucune offre"
    : undefined;
  const pendingRequests = (requests ?? []).filter((r) => r.status === "pending");
  const processedRequests = (requests ?? []).filter((r) => r.status !== "pending");

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Plateforme — Espace Pukri</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Demandes d'inscription, entreprises clientes et abonnements BudgetPilot360.
      </p>

      {error && <ErrorBanner className="mt-4">{error}</ErrorBanner>}
      {message && <SuccessBanner className="mt-4">{message}</SuccessBanner>}

      {statsLoading && (
        <div aria-busy="true" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}
      {!statsLoading && stats && (
        <motion.div variants={container} initial="hidden" animate="show" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Demandes en attente" value={String(stats.pending_requests)} hint={`${stats.new_requests_today} nouvelle(s) aujourd'hui`} />
          <StatCard label="Entreprises clientes" value={String(stats.companies_count)} hint={`${stats.active_companies} active(s) · ${stats.suspended_companies} suspendue(s)`} />
          <StatCard label="Abonnements expirant" value={String(stats.expiring_soon)} hint="sous 30 jours" />
          <StatCard label="Volume traité" value={fcfa(stats.approved_amount)} hint={plansHint} />
        </motion.div>
      )}

      {/* Demandes d'inscription */}
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }} className="card mt-6 p-5">
        <h2 className="font-display text-sm font-semibold text-fg">Demandes d'inscription</h2>
        <p className="text-xs text-fg-muted">
          Le tenant n'est créé qu'à l'approbation — le responsable reçoit alors un email d'activation
          et choisit lui-même son mot de passe.
        </p>

        {requestsLoading && (
          <div aria-busy="true" className="mt-4 space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
        {requests && requests.length === 0 && (
          <p className="mt-4 text-sm text-fg-muted">Aucune demande à examiner pour le moment.</p>
        )}

        <div className="mt-4 space-y-3">
          {pendingRequests.map((r) => (
            <div key={r.id} className="rounded-xl border border-warning/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-fg">
                    {r.company_name} <span className="text-sm font-normal text-fg-muted">· {r.industry} · {r.city}</span>
                  </p>
                  <p className="text-sm text-fg-muted">
                    {r.contact_name}
                    {r.job_title && <span className="text-fg-subtle"> ({r.job_title})</span>} — {r.email} · demande du {frDate(r.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <RequestStatusBadge status={r.status} />
                  <button
                    type="button"
                    onClick={() => { setError(null); setMessage(null); setOpenRequestId(openRequestId === r.id ? null : r.id); }}
                    className="btn btn-ghost px-3 py-1.5 text-xs"
                  >
                    {openRequestId === r.id ? "Fermer" : "Examiner"}
                  </button>
                </div>
              </div>
              {openRequestId === r.id && (
                <ReviewPanel request={r} onDone={(msg) => { setOpenRequestId(null); setMessage(msg); }} onError={(msg) => setError(msg)} />
              )}
            </div>
          ))}

          {processedRequests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3">
              <p className="text-sm text-fg-muted">
                <span className="font-medium text-fg">{r.company_name}</span> · {r.contact_name} · {frDate(r.created_at)}
                {r.status === "rejected" && r.rejection_reason && <span className="text-fg-subtle"> — {r.rejection_reason}</span>}
                {r.status === "approved" && r.plan && <span className="text-fg-subtle"> — offre {planLabel[r.plan] ?? r.plan}</span>}
              </p>
              <RequestStatusBadge status={r.status} />
            </div>
          ))}
        </div>
      </motion.section>

      {/* Entreprises clientes */}
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.15 }} className="card mt-6 overflow-x-auto p-5">
        <h2 className="font-display text-sm font-semibold text-fg">Entreprises clientes</h2>

        {isLoading && (
          <div aria-busy="true" className="mt-4 space-y-3">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        )}
        {isError && <ErrorBanner className="mt-4">Impossible d'afficher les entreprises. Réessayez.</ErrorBanner>}
        {companies && companies.length === 0 && (
          <p className="mt-4 text-sm text-fg-muted">Aucune entreprise cliente pour l'instant.</p>
        )}

        {companies && companies.length > 0 && (
          <table className="mt-4 w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-fg-subtle">
                {["Entreprise", "Créée le", "Utilisateurs", "Offre", "Expire le", "Abonnement"].map((h) => (
                  <th key={h} className="pb-2 font-medium">{h}</th>
                ))}
                <th className="pb-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const suspending = c.subscription_status === "active";
                return (
                  <tr key={c.id} className="border-t border-line transition-colors hover:bg-surface-hover">
                    <td className="py-3 font-medium text-fg">{c.name}</td>
                    <td className="py-3 text-fg-muted">{frDate(c.created_at)}</td>
                    <td className="py-3 tnum text-fg-muted">{c.users_count}</td>
                    <td className="py-3 text-fg-muted">{planLabel[c.plan] ?? c.plan}</td>
                    <td className="py-3 text-fg-muted">{frDate(c.subscription_ends_at)}</td>
                    <td className="py-3"><StatusBadge status={c.subscription_status} /></td>
                    <td className="py-3 text-right">
                      {confirmId === c.id ? (
                        <span className="inline-flex gap-2">
                          <button
                            type="button"
                            disabled={setSubscription.isPending}
                            onClick={() => setSubscription.mutate({ id: c.id, action: suspending ? "suspend" : "activate" })}
                            className="btn px-2.5 py-1 text-xs"
                            style={{ backgroundColor: suspending ? "var(--danger)" : "var(--success)", color: "#fff" }}
                          >
                            Confirmer {suspending ? "la suspension" : "la réactivation"}
                          </button>
                          <button type="button" onClick={() => setConfirmId(null)} className="btn btn-ghost px-2.5 py-1 text-xs">Annuler</button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setError(null); setConfirmId(c.id); }}
                          className={`btn px-2.5 py-1 text-xs ${suspending ? "btn-danger" : ""}`}
                          style={suspending ? undefined : { border: "1px solid color-mix(in srgb, var(--success) 35%, transparent)", color: "var(--success-ink)" }}
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
