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

/** Extrait le message d'erreur renvoyé par FastAPI ({ detail: "..." }). */
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return "Une erreur inattendue est survenue. Réessayez.";
}
