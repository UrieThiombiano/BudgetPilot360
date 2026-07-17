import { Link } from "react-router-dom";
import AuthCard from "../components/AuthCard";
import { useAuth } from "../context/AuthContext";

/** Compte authentifié mais rattaché à aucune entreprise (cas transitoire :
 * invitation en cours de traitement, ou compte orphelin). L'auto-création
 * d'entreprise n'existe plus — tout passe par une demande validée par Pukri. */
export default function NoCompanyPage() {
  const { signOut } = useAuth();

  return (
    <AuthCard
      title="Compte sans entreprise"
      subtitle="Votre compte n'est rattaché à aucune entreprise pour l'instant."
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Si vous venez d'être invité, contactez votre administrateur. Si votre
        entreprise n'a pas encore de compte BudgetPilot360, déposez une demande —
        l'équipe Pukri la validera.
      </p>
      <div className="mt-6 space-y-3">
        <Link
          to="/request-account"
          className="block w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Demander un compte entreprise
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="block w-full rounded-lg border border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Se déconnecter
        </button>
      </div>
    </AuthCard>
  );
}
