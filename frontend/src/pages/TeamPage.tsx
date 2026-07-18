import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldMinus, ShieldPlus, UserMinus, UserPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { ErrorBanner, Skeleton, SuccessBanner } from "../components/ui";

interface Member {
  id: string;
  email: string | null;
  full_name: string | null;
  job_title: string | null;
  role: string;
  created_at: string | null;
}
interface TeamResponse {
  members: Member[];
  /** Administrateur principal — seul habilité à nommer/révoquer l'adjoint. */
  owner_id: string | null;
  user_count: number;
  max_users: number;
  can_add_user: boolean;
}

const labelClass = "mb-1.5 block text-sm font-medium text-fg";

/** Chacun est désigné par son RÔLE DANS L'ENTREPRISE (job_title : Directeur
 * Général, Comptable…). Repli sur le rôle technique s'il n'est pas renseigné. */
function roleLabel(m: Member, ownerId: string | null): string {
  if (m.role === "super_admin") return "Super admin";
  if (m.job_title) return m.job_title;
  if (m.role === "admin") {
    if (ownerId === null) return "Administrateur";
    return m.id === ownerId ? "Admin principal" : "Admin adjoint";
  }
  return "Utilisateur";
}

/** Infobulle du badge : précise les droits techniques derrière le libellé. */
function roleTitle(m: Member, ownerId: string | null): string | undefined {
  if (m.role !== "admin") return undefined;
  return m.id === ownerId ? "Admin principal" : "Admin adjoint";
}

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const { data: team, isLoading, isError } = useQuery({
    queryKey: ["team"],
    queryFn: async () => (await api.get<TeamResponse>("/team/members")).data,
  });

  // Le propriétaire (admin principal) est le seul à gérer les rôles.
  const isOwner = Boolean(team?.owner_id) && profile?.id === team?.owner_id;
  const hasAdjoint = Boolean(
    team?.members.some((m) => m.role === "admin" && m.id !== team.owner_id)
  );

  const inviteMember = useMutation({
    mutationFn: async () =>
      (await api.post("/team/members", {
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        job_title: jobTitle.trim(),
      })).data,
    onSuccess: () => {
      setSuccessMessage(
        `Invitation envoyée à ${email.trim()}. Le collaborateur choisira lui-même ` +
          `son mot de passe via le lien reçu — vous ne le connaîtrez jamais.`
      );
      setEmail("");
      setFirstName("");
      setLastName("");
      setJobTitle("");
      void queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/team/members/${id}`)).data,
    onSuccess: () => {
      setActionMessage(
        "Utilisateur retiré : son accès est révoqué et une place s'est libérée. " +
          "Ses dépenses passées restent conservées."
      );
      setActionError(null);
      setConfirmingId(null);
      void queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (err) => {
      setActionError(apiErrorMessage(err));
      setConfirmingId(null);
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: "admin" | "user" }) =>
      (await api.patch(`/team/members/${id}/role`, { role })).data,
    onSuccess: (_data, vars) => {
      setActionMessage(
        vars.role === "admin"
          ? "Admin adjoint nommé : il dispose des mêmes droits que vous (validation des dépenses, budgets, équipe)."
          : "Rôle d'adjoint retiré : ce membre redevient un utilisateur."
      );
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (err) => setActionError(apiErrorMessage(err)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    inviteMember.mutate();
  }

  function renderActions(m: Member) {
    const isPrincipal = m.id === team?.owner_id;
    const displayName = m.full_name || m.email || "ce membre";

    if (isPrincipal || m.role === "super_admin" || (m.role === "admin" && !isOwner)) {
      return <span className="text-xs text-fg-subtle">Compte protégé</span>;
    }

    // Admin adjoint, vu par le principal : révocation possible.
    if (m.role === "admin") {
      return (
        <button
          type="button"
          onClick={() => { setActionError(null); setActionMessage(null); setRole.mutate({ id: m.id, role: "user" }); }}
          disabled={setRole.isPending}
          aria-label={`Retirer le rôle d'adjoint de ${displayName}`}
          className="btn btn-ghost px-2.5 py-1 text-xs"
        >
          <ShieldMinus size={13} strokeWidth={2} /> Retirer le rôle d'adjoint
        </button>
      );
    }

    // Utilisateur : retrait (tous les admins) + nomination adjoint (principal uniquement).
    if (confirmingId === m.id) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="text-xs text-fg-muted">Retirer ?</span>
          <button type="button" onClick={() => removeMember.mutate(m.id)} disabled={removeMember.isPending} className="btn px-2.5 py-1 text-xs" style={{ backgroundColor: "var(--danger)", color: "var(--danger-fg)" }}>
            {removeMember.isPending ? "…" : "Confirmer"}
          </button>
          <button type="button" onClick={() => setConfirmingId(null)} className="btn btn-ghost px-2.5 py-1 text-xs">Annuler</button>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-2">
        {isOwner && !hasAdjoint && (
          <button
            type="button"
            onClick={() => { setActionError(null); setActionMessage(null); setRole.mutate({ id: m.id, role: "admin" }); }}
            disabled={setRole.isPending}
            aria-label={`Nommer ${displayName} admin adjoint`}
            className="btn btn-ghost px-2.5 py-1 text-xs"
          >
            <ShieldPlus size={13} strokeWidth={2} /> Nommer adjoint
          </button>
        )}
        <button
          type="button"
          onClick={() => { setConfirmingId(m.id); setActionError(null); setActionMessage(null); }}
          aria-label={`Retirer ${m.full_name || m.email || "cet utilisateur"}`}
          className="btn btn-danger px-2.5 py-1 text-xs"
        >
          <UserMinus size={13} strokeWidth={2} /> Retirer
        </button>
      </span>
    );
  }

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Équipe</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Gérez les membres de votre entreprise — jusqu'à {team?.max_users ?? 3} collaborateurs,
        {isOwner && " et un admin adjoint (utile pour les co-fondateurs),"} en plus de l'administrateur principal.
      </p>

      {/* Liste des membres */}
      <section className="card mt-6 overflow-hidden">
        {(actionError || actionMessage) && (
          <div className="border-b border-line p-4">
            {actionError && <ErrorBanner>{actionError}</ErrorBanner>}
            {actionMessage && <SuccessBanner>{actionMessage}</SuccessBanner>}
          </div>
        )}
        {isLoading && (
          <div aria-busy="true" className="space-y-3 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="mt-1.5 h-3 w-48" />
                </div>
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            ))}
          </div>
        )}
        {isError && (
          <ErrorBanner className="m-6">Impossible d'afficher votre équipe. Réessayez dans un instant.</ErrorBanner>
        )}
        {team && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-surface-2">
                <tr>
                  {["Membre", "Rôle", "Ajouté le"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-fg-subtle">{h}</th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-fg-subtle">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {team.members.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-fg">{m.full_name || "Nom non renseigné"}</p>
                      <p className="text-xs text-fg-subtle">{m.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        title={roleTitle(m, team.owner_id)}
                        className={
                          m.role === "user"
                            ? "inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-fg-muted"
                            : "inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-ink"
                        }
                      >
                        {m.role !== "user" && <ShieldCheck size={12} strokeWidth={2.25} />}
                        {roleLabel(m, team.owner_id)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-muted">
                      {m.created_at ? new Date(m.created_at).toLocaleDateString("fr-FR") : "Date inconnue"}
                    </td>
                    <td className="px-4 py-3 text-right">{renderActions(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Ajout d'un utilisateur */}
      <section className="card mt-8 p-6">
        <h2 className="font-display text-base font-semibold text-fg">Ajouter un collaborateur</h2>
        {team && <p className="mt-1 text-sm text-fg-muted">{team.user_count} / {team.max_users} collaborateurs (adjoint compris).</p>}

        {team && !team.can_add_user ? (
          <div className="mt-4 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning-ink">
            <strong>Limite atteinte.</strong> Votre offre permet au maximum {team.max_users} collaborateurs en plus de
            l'administrateur principal. Contactez Pukri AI Systems pour faire évoluer votre offre.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="memberFirstName" className={labelClass}>Prénom</label>
                <input id="memberFirstName" type="text" required maxLength={60} value={firstName} onChange={(e) => setFirstName(e.target.value)} className="field" placeholder="Jean" />
              </div>
              <div>
                <label htmlFor="memberLastName" className={labelClass}>Nom</label>
                <input id="memberLastName" type="text" required maxLength={60} value={lastName} onChange={(e) => setLastName(e.target.value)} className="field" placeholder="Kaboré" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="memberEmail" className={labelClass}>
                  Email <span className="font-normal text-fg-subtle">(pro ou personnel)</span>
                </label>
                <input id="memberEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field" placeholder="jean.kabore@gmail.com" />
              </div>
              <div>
                <label htmlFor="memberJobTitle" className={labelClass}>
                  Fonction <span className="font-normal text-fg-subtle">(affichée comme rôle dans l'équipe)</span>
                </label>
                <input id="memberJobTitle" type="text" required minLength={2} maxLength={80} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="field" placeholder="Comptable, commercial…" />
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-lg bg-accent-soft px-3 py-2.5 text-xs text-accent-ink">
              <ShieldCheck size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
              <span>
                Le collaborateur recevra un email d'activation.
              </span>
            </div>

            {formError && <ErrorBanner>{formError}</ErrorBanner>}
            {successMessage && <SuccessBanner>{successMessage}</SuccessBanner>}

            <motion.button type="submit" whileTap={{ scale: 0.985 }} disabled={inviteMember.isPending} className="btn btn-primary">
              <UserPlus size={16} strokeWidth={2} />
              {inviteMember.isPending ? "Envoi de l'invitation…" : "Envoyer l'invitation"}
            </motion.button>
          </form>
        )}
      </section>
    </div>
  );
}
