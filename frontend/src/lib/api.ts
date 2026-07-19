import axios from "axios";
import { supabase } from "./supabaseClient";

// Client HTTP vers le backend FastAPI. Le token Supabase de la session courante
// est injecté sur chaque requête ; le backend le valide et applique le RBAC.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8000",
});

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Clé localStorage du motif de blocage, affiché sur l'écran de connexion. */
export const BLOCKED_MESSAGE_KEY = "bp360:blocked-reason";

// Compte bloqué côté backend : 402 = abonnement de l'entreprise suspendu (Pukri).
// On déconnecte immédiatement et on mémorise le motif pour l'écran de connexion —
// sans quoi la session resterait ouverte sur des écrans qui échouent tous.
api.interceptors.response.use(undefined, async (error) => {
  if (axios.isAxiosError(error) && error.response?.status === 402) {
    const detail = error.response.data?.detail;
    localStorage.setItem(
      BLOCKED_MESSAGE_KEY,
      typeof detail === "string"
        ? detail
        : "L'abonnement de votre entreprise est suspendu. Contactez Pukri AI Systems."
    );
    await supabase.auth.signOut();
  }
  return Promise.reject(error);
});

/** Extrait le message d'erreur renvoyé par FastAPI ({ detail: "..." }). */
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return "Une erreur inattendue est survenue. Réessayez.";
}
