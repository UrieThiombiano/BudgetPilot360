import { HandCoins } from "lucide-react";
import TransactionsPage, { type TxConfig } from "../components/TransactionsPage";

const REVENUE_CONFIG: TxConfig = {
  kind: "revenue",
  endpoint: "/revenues",
  minesKey: ["my-revenues"],
  dateField: "revenue_date",
  proofFlag: "has_proof",
  proofRoute: "proof",
  hasSource: true,
  hasComments: false,
  icon: HandCoins,
  title: "Mes recettes",
  subtitle: "Enregistrez vos recettes — elles sont comptées immédiatement, sans validation.",
  newLabel: "Nouvelle recette",
  submitLabel: "Enregistrer la recette",
  successMessage: "Recette enregistrée et comptée dans les recettes de l'entreprise.",
  emptyTitle: "Aucune recette pour l'instant",
  emptyDescription: "Ajoutez votre première recette pour suivre les entrées d'argent de l'entreprise.",
  historyErrorText: "Impossible d'afficher vos recettes. Réessayez dans un instant.",
  noCategoryText:
    "Aucune catégorie de recette — demandez à votre admin d'en créer dans « Budget & catégories ».",
  titleAdmin: "Recettes",
  noCategoryTextAdmin:
    "Aucune catégorie de recette — créez-en une dans « Budget & catégories ».",
  descPlaceholder: "Ex : vente de marchandises, prestation de service…",
  amountPlaceholder: "150000",
  sourceLabel: "Source / client (facultatif)",
  sourcePlaceholder: "Ex : Client X, boutique du marché…",
};

export default function MyRevenuesPage() {
  return <TransactionsPage config={REVENUE_CONFIG} />;
}
