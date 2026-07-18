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
      <p className="text-sm text-fg-muted">
        Si vous venez d'être invité, contactez votre administrateur. Si votre
        entreprise n'a pas encore de compte BudgetPilot360, déposez une demande —
        l'équipe Pukri la validera.
      </p>
      <div className="mt-6 space-y-3">
        <Link to="/request-account" className="btn btn-primary w-full">
          Demander un accès pour mon entreprise
        </Link>
        <button type="button" onClick={() => void signOut()} className="btn btn-ghost w-full">
          Se déconnecter
        </button>
      </div>
    </AuthCard>
  );
}
