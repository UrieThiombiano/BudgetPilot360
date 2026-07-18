import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import AuthCard from "../components/AuthCard";
import { ErrorBanner } from "../components/ui";

const labelClass = "mb-1.5 block text-sm font-medium text-fg";

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
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
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
        <p className="text-sm text-fg-muted">
          Demandez à votre administrateur de renvoyer une invitation, ou
          connectez-vous si votre compte est déjà activé.
        </p>
        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="font-medium text-accent-ink hover:underline">
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
          <label htmlFor="newPassword" className={labelClass}>Nouveau mot de passe</label>
          <input id="newPassword" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field" placeholder="8 caractères minimum" />
        </div>
        <div>
          <label htmlFor="confirmPassword" className={labelClass}>Confirmez le mot de passe</label>
          <input id="confirmPassword" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="field" placeholder="Retapez votre mot de passe" />
        </div>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <button type="submit" disabled={submitting} className="btn btn-primary w-full">
          {submitting ? "Enregistrement…" : "Activer mon compte"}
        </button>
      </form>
    </AuthCard>
  );
}
