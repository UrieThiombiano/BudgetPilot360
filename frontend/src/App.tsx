import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./context/AuthContext";
import { ProtectedRoute, PublicOnlyRoute } from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import RequestAccountPage from "./pages/RequestAccountPage";
import NoCompanyPage from "./pages/NoCompanyPage";
import DashboardPage from "./pages/DashboardPage";
import TeamPage from "./pages/TeamPage";
import BudgetSettingsPage from "./pages/BudgetSettingsPage";
import MyExpensesPage from "./pages/MyExpensesPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import ReportsPage from "./pages/ReportsPage";
import PlatformPage from "./pages/PlatformPage";
import SetPasswordPage from "./pages/SetPasswordPage";

/** Restreint une page aux admins (le backend re-vérifie de toute façon). */
function AdminOnly({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  if (profile && profile.role !== "admin" && profile.role !== "super_admin") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/** Espace plateforme : super_admin (Pukri) uniquement — le backend re-vérifie. */
function SuperAdminOnly({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  if (profile && profile.role !== "super_admin") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      {/* Demande de compte entreprise : PUBLIQUE — ne crée jamais de tenant,
          Pukri valide chaque demande (décision d'architecture). */}
      <Route path="/request-account" element={<RequestAccountPage />} />
      {/* Activation d'un compte invité : la page gère elle-même la présence
          de session (lien email Supabase) — ni PublicOnly ni Protected. */}
      <Route path="/set-password" element={<SetPasswordPage />} />
      {/* Compte authentifié sans entreprise (l'onboarding self-service n'existe plus) */}
      <Route
        path="/no-company"
        element={
          <ProtectedRoute requireCompany={false}>
            <NoCompanyPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <DashboardPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/expenses"
        element={
          <ProtectedRoute>
            <Layout>
              <MyExpensesPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/budget"
        element={
          <ProtectedRoute>
            <Layout>
              <BudgetSettingsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/approvals"
        element={
          <ProtectedRoute>
            <AdminOnly>
              <Layout>
                <ApprovalsPage />
              </Layout>
            </AdminOnly>
          </ProtectedRoute>
        }
      />
      <Route
        path="/platform"
        element={
          <ProtectedRoute requireCompany={false}>
            <SuperAdminOnly>
              <Layout>
                <PlatformPage />
              </Layout>
            </SuperAdminOnly>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <AdminOnly>
              <Layout>
                <ReportsPage />
              </Layout>
            </AdminOnly>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team"
        element={
          <ProtectedRoute>
            <AdminOnly>
              <Layout>
                <TeamPage />
              </Layout>
            </AdminOnly>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
