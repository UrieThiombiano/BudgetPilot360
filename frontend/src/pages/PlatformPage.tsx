import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Factory, MapPin, Megaphone, Phone, Trash2, Users, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, apiErrorMessage } from "../lib/api";
import { useIsDark } from "../hooks/useTheme";
import { chartColors } from "../lib/chartTheme";
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
  seats_used: number;
  max_seats: number;
  ai_calls_month: number;
  last_activity: string | null;
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
  ai_calls_month: number;
  referral_sources: Record<string, number>;
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
  referral_source: string | null;
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

/* ---------- Insights « analyst » ---------- */

/** Fraîcheur d'activité (dernière dépense/recette) — le signal de churn :
 * point coloré + libellé texte (jamais la couleur seule). */
function activityInfo(iso: string | null): { label: string; dot: string } {
  if (!iso) return { label: "Jamais", dot: "bg-danger" };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 1) return { label: days <= 0 ? "Aujourd'hui" : "Hier", dot: "bg-success" };
  if (days <= 7) return { label: `Il y a ${days} j`, dot: "bg-success" };
  if (days <= 30) return { label: `Il y a ${days} j`, dot: "bg-warning" };
  return { label: `Il y a ${days} j`, dot: "bg-danger" };
}

interface HBarDatum { name: string; value: number }

/** Barres horizontales mono-série (identité sur l'axe, magnitude en longueur) :
 * marques fines, bout arrondi côté valeur, libellés directs, tooltip au survol.
 * Une seule teinte — le titre nomme la série, pas de légende nécessaire. */
function HBarCard({
  title,
  subtitle,
  data,
  emptyText,
  formatValue = (v: number) => String(v),
}: {
  title: string;
  subtitle: string;
  data: HBarDatum[];
  emptyText: string;
  formatValue?: (v: number) => string;
}) {
  const dark = useIsDark();
  const colors = chartColors(dark);
  const hasData = data.length > 0 && data.some((d) => d.value > 0);
  return (
    <motion.div variants={item} className="card p-5">
      <h3 className="font-display text-sm font-semibold text-fg">{title}</h3>
      <p className="mt-0.5 text-xs text-fg-subtle">{subtitle}</p>
      {!hasData ? (
        <p className="mt-4 text-sm text-fg-muted">{emptyText}</p>
      ) : (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={data.length * 38 + 8}>
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={116}
                tickLine={false}
                axisLine={false}
                tick={{ fill: colors.muted, fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: colors.cursor }}
                contentStyle={{
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.grid}`,
                  borderRadius: 10,
                  fontSize: 12,
                  color: colors.muted,
                }}
                formatter={(value) => [formatValue(Number(value)), title]}
              />
              <Bar
                dataKey="value"
                fill={colors.bar}
                barSize={14}
                radius={[0, 4, 4, 0]}
                background={{ fill: colors.cursor, radius: 4 }}
              >
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(v: string | number) => formatValue(Number(v))}
                  style={{ fill: colors.muted, fontSize: 12, fontVariantNumeric: "tabular-nums" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
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
    ...(request.referral_source
      ? [{ icon: Megaphone, text: `Nous a connu via : ${request.referral_source}` }]
      : []),
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
  // Suppression définitive : la cible + le nom saisi pour confirmer.
  const [deleteTarget, setDeleteTarget] = useState<PlatformCompany | null>(null);
  const [deleteName, setDeleteName] = useState("");

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

  const deleteCompany = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/platform/companies/${id}`)).data,
    onSuccess: () => {
      setMessage(
        `Entreprise « ${deleteTarget?.name} » supprimée définitivement — données, utilisateurs et justificatifs effacés.`
      );
      setDeleteTarget(null);
      setDeleteName("");
      void queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-stats"] });
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const pendingRequests = (requests ?? []).filter((r) => r.status === "pending");
  const processedRequests = (requests ?? []).filter((r) => r.status !== "pending");

  // Données des visuels — une seule teinte par graphique (mono-série).
  const planData: HBarDatum[] = PLANS.map((p) => ({
    name: planLabel[p],
    value: stats?.plans[p] ?? 0,
  }));
  const referralData: HBarDatum[] = Object.entries(stats?.referral_sources ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));
  const aiData: HBarDatum[] = (companies ?? [])
    .filter((c) => c.ai_calls_month > 0)
    .sort((a, b) => b.ai_calls_month - a.ai_calls_month)
    .slice(0, 5)
    .map((c) => ({ name: c.name, value: c.ai_calls_month }));

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Plateforme — Espace Pukri</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Demandes d'inscription, entreprises clientes et abonnements BudgetPilot360.
      </p>

      {error && <ErrorBanner className="mt-4">{error}</ErrorBanner>}
      {message && <SuccessBanner className="mt-4">{message}</SuccessBanner>}

      {statsLoading && (
        <div aria-busy="true" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}
      {!statsLoading && stats && (
        <motion.div variants={container} initial="hidden" animate="show" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Demandes en attente" value={String(stats.pending_requests)} hint={`${stats.new_requests_today} nouvelle(s) aujourd'hui`} />
          <StatCard label="Entreprises clientes" value={String(stats.companies_count)} hint={`${stats.active_companies} active(s) · ${stats.suspended_companies} suspendue(s)`} />
          <StatCard label="Abonnements expirant" value={String(stats.expiring_soon)} hint="sous 30 jours" />
          <StatCard label="Appels IA ce mois" value={String(stats.ai_calls_month)} hint="coût API Mistral à surveiller" />
          <StatCard label="Volume traité" value={fcfa(stats.approved_amount)} hint={`${stats.expenses_count} dépense(s) enregistrée(s)`} />
        </motion.div>
      )}

      {/* Visuels analyst — répartition, acquisition, usage IA */}
      {!statsLoading && stats && (
        <motion.div variants={container} initial="hidden" animate="show" className="mt-6 grid gap-4 lg:grid-cols-3">
          <HBarCard
            title="Répartition des offres"
            subtitle="Entreprises clientes par offre"
            data={planData}
            emptyText="Aucune entreprise cliente pour l'instant."
          />
          <HBarCard
            title="Canaux d'acquisition"
            subtitle="« Comment nous avez-vous connu ? » sur les demandes"
            data={referralData}
            emptyText="Aucun canal déclaré pour l'instant — le champ vient d'être ajouté au formulaire."
          />
          <HBarCard
            title="Utilisation de l'IA"
            subtitle="Appels à l'assistant ce mois-ci, par entreprise (top 5)"
            data={aiData}
            emptyText="Aucun appel à l'assistant IA ce mois-ci."
          />
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
          <table className="mt-4 w-full min-w-[920px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-fg-subtle">
                {["Entreprise", "Activité", "Sièges", "IA / mois", "Offre", "Expire le", "Abonnement"].map((h) => (
                  <th key={h} className="pb-2 font-medium">{h}</th>
                ))}
                <th className="pb-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const suspending = c.subscription_status === "active";
                const activity = activityInfo(c.last_activity);
                const seatsFull = c.seats_used >= c.max_seats;
                return (
                  <tr key={c.id} className="border-t border-line transition-colors hover:bg-surface-hover">
                    <td className="py-3">
                      <p className="font-medium text-fg">{c.name}</p>
                      <p className="text-xs text-fg-subtle">depuis le {frDate(c.created_at)}</p>
                    </td>
                    <td className="py-3">
                      {/* Point + libellé : la couleur n'est jamais seule */}
                      <span className="inline-flex items-center gap-1.5 text-fg-muted">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${activity.dot}`} aria-hidden />
                        {activity.label}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="tnum text-fg-muted">{c.seats_used}/{c.max_seats}</span>
                        <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: `${Math.min((c.seats_used / c.max_seats) * 100, 100)}%` }}
                          />
                        </span>
                        {seatsFull && (
                          <span
                            className={`${badgeBase} bg-warning-soft text-warning-ink`}
                            title="Tous les sièges sont occupés — candidat à une offre supérieure"
                          >
                            Complet
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 tnum text-fg-muted">{c.ai_calls_month > 0 ? c.ai_calls_month : "—"}</td>
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
                        <span className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setError(null); setConfirmId(c.id); }}
                            className={`btn px-2.5 py-1 text-xs ${suspending ? "btn-danger" : ""}`}
                            style={suspending ? undefined : { border: "1px solid color-mix(in srgb, var(--success) 35%, transparent)", color: "var(--success-ink)" }}
                          >
                            {suspending ? "Suspendre" : "Réactiver"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setError(null); setMessage(null); setDeleteTarget(c); setDeleteName(""); }}
                            aria-label={`Supprimer définitivement ${c.name}`}
                            title="Supprimer définitivement"
                            className="btn btn-ghost px-2 py-1 text-xs text-danger-ink"
                          >
                            <Trash2 size={13} strokeWidth={2} />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Zone de danger : suppression définitive, confirmée par la saisie du nom */}
        {deleteTarget && (
          <div className="mt-5 rounded-xl border border-danger/40 bg-danger-soft/40 p-4">
            <p className="text-sm font-semibold text-danger-ink">
              Supprimer définitivement « {deleteTarget.name} »
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              Action irréversible : dépenses, recettes, budgets, utilisateurs, comptes de
              connexion et justificatifs seront effacés. Pour une coupure temporaire,
              préférez « Suspendre ». Tapez le nom exact de l'entreprise pour confirmer.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                aria-label="Nom de l'entreprise à supprimer"
                value={deleteName}
                onChange={(e) => setDeleteName(e.target.value)}
                className="field max-w-72"
                placeholder={deleteTarget.name}
              />
              <button
                type="button"
                disabled={deleteName.trim() !== deleteTarget.name || deleteCompany.isPending}
                onClick={() => deleteCompany.mutate(deleteTarget.id)}
                className="btn btn-danger px-3 py-1.5 text-xs disabled:opacity-50"
              >
                <Trash2 size={13} strokeWidth={2} />
                {deleteCompany.isPending ? "Suppression…" : "Supprimer définitivement"}
              </button>
              <button
                type="button"
                onClick={() => { setDeleteTarget(null); setDeleteName(""); }}
                className="btn btn-ghost px-3 py-1.5 text-xs"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </motion.section>
    </div>
  );
}
