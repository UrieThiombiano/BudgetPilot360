import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api, apiErrorMessage } from "../lib/api";
import { ErrorBanner } from "../components/ui";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

const labelClass = "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

/**
 * Demande de compte entreprise — PUBLIQUE. Ne crée ni tenant ni compte :
 * enregistre une demande examinée par Pukri (décision d'architecture).
 */
export default function RequestAccountPage() {
  const [form, setForm] = useState({
    company_name: "",
    industry: "",
    contact_name: "",
    email: "",
    phone: "",
    city: "",
    employees_count: "",
    message: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/registration/requests", {
        ...form,
        employees_count: form.employees_count ? Number(form.employees_count) : null,
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-900">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-xl"
      >
        <div className="mb-6 text-center">
          <span className="text-2xl font-bold text-slate-900 dark:text-white">
            BudgetPilot<span className="text-indigo-600">360</span>
          </span>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-lg dark:bg-slate-800">
          {sent ? (
            <div className="text-center">
              <p className="text-4xl">📨</p>
              <h1 className="mt-3 text-xl font-semibold text-slate-900 dark:text-white">
                Demande envoyée !
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                L'équipe Pukri AI Systems examine votre demande. Une fois validée,
                le responsable recevra un email d'activation pour créer son mot de
                passe et configurer l'entreprise.
              </p>
              <p className="mt-6 text-sm">
                <Link to="/login" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                  Retour à la connexion
                </Link>
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
                Demander un compte
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Présentez votre entreprise — Pukri valide chaque demande avant
                l'ouverture du compte.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reqCompany" className={labelClass}>Nom de l'entreprise</label>
                    <input id="reqCompany" required minLength={2} maxLength={120} value={form.company_name} onChange={set("company_name")} className={inputClass} placeholder="Faso Distribution SARL" />
                  </div>
                  <div>
                    <label htmlFor="reqIndustry" className={labelClass}>Secteur d'activité</label>
                    <input id="reqIndustry" required minLength={2} maxLength={80} value={form.industry} onChange={set("industry")} className={inputClass} placeholder="Commerce, BTP, services…" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reqContact" className={labelClass}>Nom du responsable</label>
                    <input id="reqContact" required minLength={2} maxLength={120} value={form.contact_name} onChange={set("contact_name")} className={inputClass} placeholder="Awa Ouédraogo" />
                  </div>
                  <div>
                    <label htmlFor="reqEmail" className={labelClass}>Email professionnel</label>
                    <input id="reqEmail" type="email" required value={form.email} onChange={set("email")} className={inputClass} placeholder="direction@entreprise.bf" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="reqPhone" className={labelClass}>Téléphone</label>
                    <input id="reqPhone" required minLength={6} maxLength={30} value={form.phone} onChange={set("phone")} className={inputClass} placeholder="+226 70 00 00 00" />
                  </div>
                  <div>
                    <label htmlFor="reqCity" className={labelClass}>Ville</label>
                    <input id="reqCity" required minLength={2} maxLength={80} value={form.city} onChange={set("city")} className={inputClass} placeholder="Ouagadougou" />
                  </div>
                  <div>
                    <label htmlFor="reqEmployees" className={labelClass}>
                      Employés <span className="font-normal text-slate-400">(facultatif)</span>
                    </label>
                    <input id="reqEmployees" type="number" min={1} max={100000} value={form.employees_count} onChange={set("employees_count")} className={inputClass} placeholder="12" />
                  </div>
                </div>
                <div>
                  <label htmlFor="reqMessage" className={labelClass}>
                    Message <span className="font-normal text-slate-400">(facultatif)</span>
                  </label>
                  <textarea id="reqMessage" rows={3} maxLength={1000} value={form.message} onChange={set("message")} className={inputClass} placeholder="Vos besoins, votre contexte…" />
                </div>

                {error && <ErrorBanner>{error}</ErrorBanner>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                >
                  {submitting ? "Envoi…" : "Envoyer ma demande"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Déjà un compte ?{" "}
                <Link to="/login" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                  Se connecter
                </Link>
              </p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
