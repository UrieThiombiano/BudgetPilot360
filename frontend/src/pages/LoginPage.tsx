import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import { BLOCKED_MESSAGE_KEY } from "../lib/api";
import AuthCard from "../components/AuthCard";
import { ErrorBanner, SuccessBanner } from "../components/ui";

type Mode = "password" | "magic";

/** Motif de blocage déposé par l'intercepteur API (abonnement suspendu) :
 * affiché une seule fois, à l'arrivée sur l'écran de connexion. */
function consumeBlockedMessage(): string | null {
  const message = localStorage.getItem(BLOCKED_MESSAGE_KEY);
  if (message) localStorage.removeItem(BLOCKED_MESSAGE_KEY);
  return message;
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(consumeBlockedMessage);
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
    <AuthCard title="Content de vous revoir" subtitle="Connectez-vous pour reprendre le pilotage.">
      {/* Choix du mode de connexion */}
      <div
        role="tablist"
        aria-label="Mode de connexion"
        className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1"
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
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === m.id
                ? "bg-surface text-fg shadow-card"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-fg">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
            placeholder="vous@entreprise.com"
          />
        </div>

        {mode === "password" && (
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-fg">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
              placeholder="Votre mot de passe"
            />
          </div>
        )}

        {mode === "magic" && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-muted">
            Vous recevrez un lien de connexion sécurisé par email — aucun mot de
            passe à saisir.
          </p>
        )}

        {error && <ErrorBanner>{error}</ErrorBanner>}
        {info && <SuccessBanner>{info}</SuccessBanner>}

        <motion.button
          type="submit"
          disabled={submitting}
          whileTap={{ scale: 0.985 }}
          className="btn btn-primary w-full shadow-accent-glow"
        >
          {submitting
            ? "Un instant…"
            : mode === "password"
              ? "Se connecter"
              : "Recevoir le lien de connexion"}
        </motion.button>
      </form>

      <p className="mt-6 text-center text-sm text-fg-muted">
        Votre entreprise n'a pas encore de compte ?{" "}
        <Link to="/request-account" className="font-semibold text-accent-ink hover:underline">
          Demander un accès
        </Link>
      </p>
    </AuthCard>
  );
}
