import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import AuthCard from "../components/AuthCard";
import { ErrorBanner, SuccessBanner } from "../components/ui";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

type Mode = "password" | "magic";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setSubmitting(false);
      if (error) {
        setError(
          error.message === "Invalid login credentials"
            ? "Email ou mot de passe incorrect."
            : error.message
        );
      }
      // Succès : onAuthStateChange met à jour la session, PublicOnlyRoute redirige.
      return;
    }

    // Auth par email (lien magique). shouldCreateUser: false — la connexion par
    // email ne crée JAMAIS de compte : l'inscription passe par la validation Pukri.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin,
      },
    });
    setSubmitting(false);
    if (error) {
      setError(
        error.message.toLowerCase().includes("signups not allowed")
          ? "Aucun compte n'existe avec cet email."
          : error.message.toLowerCase().includes("rate limit")
            ? "Trop d'emails envoyés — réessayez dans quelques minutes."
            : error.message
      );
      return;
    }
    setInfo(
      `Lien de connexion envoyé à ${email}. Ouvrez l'email et cliquez le lien pour vous connecter.`
    );
  }

  return (
    <AuthCard
      title="Connexion"
      subtitle="Pilotez votre budget en toute sérénité."
    >
      {/* Choix du mode de connexion */}
      <div
        role="tablist"
        aria-label="Mode de connexion"
        className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-900"
      >
        {(
          [
            { id: "password", label: "Mot de passe" },
            { id: "magic", label: "Lien par email" },
          ] as { id: Mode; label: string }[]
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => {
              setMode(m.id);
              setError(null);
              setInfo(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === m.id
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="vous@entreprise.bf"
          />
        </div>

        {mode === "password" && (
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>
        )}

        {mode === "magic" && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Vous recevrez un lien de connexion sécurisé par email — aucun mot de
            passe à saisir.
          </p>
        )}

        {error && <ErrorBanner>{error}</ErrorBanner>}
        {info && <SuccessBanner>{info}</SuccessBanner>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting
            ? "Envoi…"
            : mode === "password"
              ? "Se connecter"
              : "Recevoir le lien de connexion"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Votre entreprise n'a pas encore de compte ?{" "}
        <Link to="/request-account" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          Demander un compte
        </Link>
      </p>
    </AuthCard>
  );
}
