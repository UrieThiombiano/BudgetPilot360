import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { api } from "../lib/api";

export type Role = "super_admin" | "admin" | "user";

export interface Profile {
  id: string;
  email: string | null;
  company_id: string | null;
  role: Role;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  /** true tant que la session initiale ET le profil ne sont pas résolus */
  loading: boolean;
  /** Recharge le profil depuis le backend (ex : après l'onboarding) */
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (currentSession: Session | null) => {
    if (!currentSession) {
      setProfile(null);
      return;
    }
    try {
      const { data } = await api.get<Profile>("/profiles/me");
      setProfile(data);
    } catch {
      // Profil pas encore disponible (ex : latence du trigger) — on ne bloque pas.
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await fetchProfile(data.session);
      if (active) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!active) return;
        setSession(newSession);
        // onAuthStateChange est synchrone côté supabase-js : on ne fait pas
        // d'await ici pour ne pas bloquer le lock interne du client.
        void fetchProfile(newSession);
      }
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await fetchProfile(data.session);
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé sous <AuthProvider>");
  return ctx;
}
