import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import AuthCard from "../components/AuthCard";
import { ErrorBanner } from "../components/ui";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

/**
 * Activation du compte invité : le lien email Supabase ouvre une session
 * temporaire, le collaborateur choisit ICI son mot de passe — lui seul le
 * connaît (l'admin n'en a jamais eu connaissance).
 */
export default function SetPasswordPage() {
  const { session, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (done) {
    return <Navigate to="/" replace />;
  }

  if (!session) {
    return (
      <AuthCard
        title="Lien invalide ou expiré"
        subtitle="Ce lien d'activation n'est plus valable."
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Demandez à votre administrateur de renvoyer une invitation, ou
          connectez-vous si votre compte est déjà activé.
        </p>
        <p className="mt-4 text-center text-sm">
          <Link
            to="/login"
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Aller à la connexion
          </Link>
        </p>
      </AuthCard>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
  }

  return (
    <AuthCard
      title="Choisissez votre mot de passe"
      subtitle="Votre compte est presque prêt — vous seul connaîtrez ce mot de passe."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Nouveau mot de passe
          </label>
          <input
            id="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="8 caractères minimum"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Confirmez le mot de passe
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
            placeholder="••••••••"
          />
        </div>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? "Enregistrement…" : "Activer mon compte"}
        </button>
      </form>
    </AuthCard>
  );
}
