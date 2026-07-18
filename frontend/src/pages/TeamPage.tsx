import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
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
  user_count: number;
  max_users: number;
  can_add_user: boolean;
}

const roleLabel: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Administrateur",
  user: "Utilisateur",
};

const labelClass = "mb-1.5 block text-sm font-medium text-fg";

export default function TeamPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeMessage, setRemoveMessage] = useState<string | null>(null);

  const { data: team, isLoading, isError } = useQuery({
    queryKey: ["team"],
    queryFn: async () => (await api.get<TeamResponse>("/team/members")).data,
  });

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
      setRemoveMessage(
        "Utilisateur retiré : son accès est révoqué et une place s'est libérée. " +
          "Ses dépenses passées restent conservées."
      );
      setRemoveError(null);
      setConfirmingId(null);
      void queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (err) => {
      setRemoveError(apiErrorMessage(err));
      setConfirmingId(null);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    inviteMember.mutate();
  }

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Équipe</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Gérez les membres de votre entreprise — 1 administrateur et jusqu'à {team?.max_users ?? 3} utilisateurs.
      </p>

      {/* Liste des membres */}
      <section className="card mt-6 overflow-hidden">
        {(removeError || removeMessage) && (
          <div className="border-b border-line p-4">
            {removeError && <ErrorBanner>{removeError}</ErrorBanner>}
            {removeMessage && <SuccessBanner>{removeMessage}</SuccessBanner>}
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
                      <p className="text-sm font-medium text-fg">
                        {m.full_name || "Nom non renseigné"}
                        {m.job_title && <span className="ml-2 text-xs font-normal text-fg-subtle">· {m.job_title}</span>}
                      </p>
                      <p className="text-xs text-fg-subtle">{m.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          m.role === "user"
                            ? "inline-flex rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-fg-muted"
                            : "inline-flex rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-ink"
                        }
                      >
                        {roleLabel[m.role] ?? m.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-muted">
                      {m.created_at ? new Date(m.created_at).toLocaleDateString("fr-FR") : "Date inconnue"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.role !== "user" ? (
                        <span className="text-xs text-fg-subtle">Compte protégé</span>
                      ) : confirmingId === m.id ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-xs text-fg-muted">Retirer ?</span>
                          <button type="button" onClick={() => removeMember.mutate(m.id)} disabled={removeMember.isPending} className="btn px-2.5 py-1 text-xs" style={{ backgroundColor: "var(--danger)", color: "var(--danger-fg)" }}>
                            {removeMember.isPending ? "…" : "Confirmer"}
                          </button>
                          <button type="button" onClick={() => setConfirmingId(null)} className="btn btn-ghost px-2.5 py-1 text-xs">Annuler</button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setConfirmingId(m.id); setRemoveError(null); setRemoveMessage(null); }}
                          aria-label={`Retirer ${m.full_name || m.email || "cet utilisateur"}`}
                          className="btn btn-danger px-2.5 py-1 text-xs"
                        >
                          <UserMinus size={13} strokeWidth={2} /> Retirer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Ajout d'un utilisateur */}
      <section className="card mt-8 p-6">
        <h2 className="font-display text-base font-semibold text-fg">Ajouter un utilisateur</h2>
        {team && <p className="mt-1 text-sm text-fg-muted">{team.user_count} / {team.max_users} utilisateurs créés.</p>}

        {team && !team.can_add_user ? (
          <div className="mt-4 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning-ink">
            <strong>Limite atteinte.</strong> Votre offre permet au maximum {team.max_users} utilisateurs en plus de
            l'administrateur. Contactez Pukri AI Systems pour faire évoluer votre offre.
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
                  Fonction <span className="font-normal text-fg-subtle">(facultatif)</span>
                </label>
                <input id="memberJobTitle" type="text" maxLength={80} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="field" placeholder="Comptable, commercial…" />
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-lg bg-accent-soft px-3 py-2.5 text-xs text-accent-ink">
              <ShieldCheck size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
              <span>
                Aucun mot de passe à définir : le collaborateur recevra un email d'activation et choisira lui-même
                son mot de passe. Personne d'autre ne le connaîtra — chaque action reste ainsi imputable.
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
