import { useState, type FormEvent } from "react";
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

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

export default function TeamPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data: team, isLoading, isError } = useQuery({
    queryKey: ["team"],
    queryFn: async () => (await api.get<TeamResponse>("/team/members")).data,
  });

  const inviteMember = useMutation({
    mutationFn: async () =>
      (
        await api.post("/team/members", {
          email: email.trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          job_title: jobTitle.trim(),
        })
      ).data,
    onSuccess: () => {
      setSuccessMessage(
        `Invitation envoyée à ${email.trim()}. Le collaborateur choisira lui-même ` +
          `son mot de passe via le lien reçu par email — vous ne le connaîtrez jamais.`
      );
      setEmail("");
      setFirstName("");
      setLastName("");
      setJobTitle("");
      void queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    inviteMember.mutate();
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
        Équipe
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Gérez les membres de votre entreprise — 1 administrateur et jusqu'à{" "}
        {team?.max_users ?? 3} utilisateurs.
      </p>

      {/* Liste des membres */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
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
          <ErrorBanner className="m-6">
            Impossible de charger l'équipe. Vérifiez que le backend est démarré.
          </ErrorBanner>
        )}
        {team && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Membre
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Rôle
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Ajouté le
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {team.members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {m.full_name || "—"}
                        {m.job_title && (
                          <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                            · {m.job_title}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {m.email}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          m.role === "user"
                            ? "inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            : "inline-flex rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                        }
                      >
                        {roleLabel[m.role] ?? m.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                      {m.created_at
                        ? new Date(m.created_at).toLocaleDateString("fr-FR")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Création d'un utilisateur */}
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Ajouter un utilisateur
        </h2>

        {team && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {team.user_count} / {team.max_users} utilisateurs créés.
          </p>
        )}

        {team && !team.can_add_user ? (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <strong>Limite atteinte.</strong> Votre abonnement permet au maximum{" "}
            {team.max_users} utilisateurs en plus de l'administrateur. Contactez
            Pukri AI Systems pour faire évoluer votre offre.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="memberFirstName" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Prénom
                </label>
                <input
                  id="memberFirstName"
                  type="text"
                  required
                  maxLength={60}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputClass}
                  placeholder="Jean"
                />
              </div>
              <div>
                <label htmlFor="memberLastName" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Nom
                </label>
                <input
                  id="memberLastName"
                  type="text"
                  required
                  maxLength={60}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={inputClass}
                  placeholder="Kaboré"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="memberEmail" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Email <span className="font-normal text-slate-400">(pro ou personnel)</span>
                </label>
                <input
                  id="memberEmail"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="jean.kabore@gmail.com"
                />
              </div>
              <div>
                <label htmlFor="memberJobTitle" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Fonction <span className="font-normal text-slate-400">(facultatif)</span>
                </label>
                <input
                  id="memberJobTitle"
                  type="text"
                  maxLength={80}
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className={inputClass}
                  placeholder="Comptable, commercial…"
                />
              </div>
            </div>

            <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
              🔒 Aucun mot de passe à définir : le collaborateur recevra un email
              d'activation et choisira lui-même son mot de passe. Personne d'autre
              que lui ne le connaîtra — chaque action reste ainsi imputable.
            </p>

            {formError && <ErrorBanner>{formError}</ErrorBanner>}
            {successMessage && <SuccessBanner>{successMessage}</SuccessBanner>}

            <button
              type="submit"
              disabled={inviteMember.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
            >
              {inviteMember.isPending ? "Envoi de l'invitation…" : "Envoyer l'invitation"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
