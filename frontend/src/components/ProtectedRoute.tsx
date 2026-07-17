import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
    </div>
  );
}

/**
 * Route protégée :
 * - pas de session → /login
 * - session mais pas d'entreprise → /onboarding (sauf si requireCompany=false)
 */
export function ProtectedRoute({
  children,
  requireCompany = true,
}: {
  children: ReactNode;
  requireCompany?: boolean;
}) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requireCompany && !profile?.company_id) {
    // Le super_admin (Pukri) n'appartient à aucun tenant : son espace est /platform.
    if (profile?.role === "super_admin") {
      return <Navigate to="/platform" replace />;
    }
    // Plus d'onboarding self-service : les tenants naissent via une demande validée.
    return <Navigate to="/no-company" replace />;
  }

  return <>{children}</>;
}

/** Routes publiques (login/signup) : redirige vers l'app si déjà connecté. */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();

  if (loading) return <FullScreenLoader />;

  if (session) {
    if (profile?.company_id) return <Navigate to="/" replace />;
    return (
      <Navigate to={profile?.role === "super_admin" ? "/platform" : "/no-company"} replace />
    );
  }

  return <>{children}</>;
}
