import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MailCheck } from "lucide-react";
import { api, apiErrorMessage } from "../lib/api";
import { ErrorBanner } from "../components/ui";

const labelClass = "mb-1.5 block text-sm font-medium text-fg";

/** Canaux d'acquisition proposés — agrégés dans l'espace Pukri (marketing). */
const REFERRAL_OPTIONS = [
  "Bouche-à-oreille",
  "Recommandation d'un client",
  "Réseaux sociaux",
  "Recherche Google",
  "Événement / salon",
  "Presse / médias",
  "Autre",
];

/**
 * Demande de compte entreprise — PUBLIQUE. Ne crée ni tenant ni compte :
 * enregistre une demande examinée par Pukri (décision d'architecture).
 */
export default function RequestAccountPage() {
  const [form, setForm] = useState({
    company_name: "",
    industry: "",
    contact_name: "",
    job_title: "",
    email: "",
    phone: "",
    city: "",
    employees_count: "",
    referral_source: "",
    message: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/registration/requests", {
        ...form,
        employees_count: form.employees_count ? Number(form.employees_count) : null,
        referral_source: form.referral_source || null,
        message: form.message || null,
      });
      setSent(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-xl"
      >
        <div className="mb-6 text-center">
          <span className="font-display text-2xl font-bold tracking-tight text-fg">
            BudgetPilot<span className="text-accent-ink">360</span>
          </span>
        </div>

        <div className="card p-8 shadow-elevated">
          {sent ? (
            <div className="flex flex-col items-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
                <MailCheck size={26} strokeWidth={1.75} />
              </span>
              <h1 className="mt-4 font-display text-xl font-semibold text-fg">Demande envoyée</h1>
              <p className="mt-2 max-w-sm text-sm text-fg-muted">
                L'équipe Pukri AI Systems examine votre demande. Une fois validée, le responsable
                recevra un email pour activer son compte et configurer l'entreprise.
              </p>
              <Link to="/login" className="mt-6 font-medium text-accent-ink hover:underline">
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-display text-xl font-semibold text-fg">Demander un accès</h1>
              <p className="mt-1.5 text-sm text-fg-muted">
                Présentez votre entreprise — Pukri valide chaque demande avant l'ouverture du compte.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reqCompany" className={labelClass}>Nom de l'entreprise</label>
                    <input id="reqCompany" required minLength={2} maxLength={120} value={form.company_name} onChange={set("company_name")} className="field" placeholder="Faso Distribution SARL" />
                  </div>
                  <div>
                    <label htmlFor="reqIndustry" className={labelClass}>Secteur d'activité</label>
                    <input id="reqIndustry" required minLength={2} maxLength={80} value={form.industry} onChange={set("industry")} className="field" placeholder="Commerce, BTP, services…" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reqContact" className={labelClass}>Nom du responsable</label>
                    <input id="reqContact" required minLength={2} maxLength={120} value={form.contact_name} onChange={set("contact_name")} className="field" placeholder="Awa Ouédraogo" />
                  </div>
                  <div>
                    <label htmlFor="reqJobTitle" className={labelClass}>Votre rôle dans l'entreprise</label>
                    <input id="reqJobTitle" required minLength={2} maxLength={80} value={form.job_title} onChange={set("job_title")} className="field" placeholder="Directeur Général, Gérante…" />
                    <p className="mt-1 text-xs text-fg-subtle">C'est ainsi que vous serez désigné dans l'application.</p>
                  </div>
                </div>
                <div>
                  <label htmlFor="reqEmail" className={labelClass}>Email du responsable</label>
                  <input id="reqEmail" type="email" required value={form.email} onChange={set("email")} className="field" placeholder="vous@entreprise.com" />
                  <p className="mt-1 text-xs text-fg-subtle">Un email personnel (Gmail, Yahoo…) convient parfaitement.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="reqPhone" className={labelClass}>Téléphone</label>
                    <input id="reqPhone" required minLength={6} maxLength={30} value={form.phone} onChange={set("phone")} className="field" placeholder="+226 70 00 00 00" />
                  </div>
                  <div>
                    <label htmlFor="reqCity" className={labelClass}>Ville</label>
                    <input id="reqCity" required minLength={2} maxLength={80} value={form.city} onChange={set("city")} className="field" placeholder="Ouagadougou" />
                  </div>
                  <div>
                    <label htmlFor="reqEmployees" className={labelClass}>
                      Employés <span className="font-normal text-fg-subtle">(facultatif)</span>
                    </label>
                    <input id="reqEmployees" type="number" min={1} max={100000} value={form.employees_count} onChange={set("employees_count")} className="field tnum" placeholder="12" />
                  </div>
                </div>
                <div>
                  <label htmlFor="reqReferral" className={labelClass}>
                    Comment nous avez-vous connu ? <span className="font-normal text-fg-subtle">(facultatif)</span>
                  </label>
                  <select id="reqReferral" value={form.referral_source} onChange={set("referral_source")} className="field">
                    <option value="">Sélectionner…</option>
                    {REFERRAL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="reqMessage" className={labelClass}>
                    Message <span className="font-normal text-fg-subtle">(facultatif)</span>
                  </label>
                  <textarea id="reqMessage" rows={3} maxLength={1000} value={form.message} onChange={set("message")} className="field" placeholder="Vos besoins, votre contexte…" />
                </div>

                {error && <ErrorBanner>{error}</ErrorBanner>}

                <motion.button type="submit" whileTap={{ scale: 0.985 }} disabled={submitting} className="btn btn-primary w-full">
                  {submitting ? "Envoi…" : "Envoyer ma demande"}
                </motion.button>
              </form>

              <p className="mt-6 text-center text-sm text-fg-muted">
                Déjà un compte ?{" "}
                <Link to="/login" className="font-medium text-accent-ink hover:underline">Se connecter</Link>
              </p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
