import { Receipt } from "lucide-react";
import TransactionsPage, { type TxConfig } from "../components/TransactionsPage";
import RecurringExpenses from "../components/RecurringExpenses";

const EXPENSE_CONFIG: TxConfig = {
  kind: "expense",
  endpoint: "/expenses",
  minesKey: ["my-expenses"],
  dateField: "expense_date",
  proofFlag: "has_receipt",
  proofRoute: "receipt",
  hasSource: false,
  hasComments: true,
  icon: Receipt,
  title: "Mes dépenses",
  subtitle: "Enregistrez vos dépenses avec justificatif — votre admin les valide.",
  newLabel: "Nouvelle dépense",
  submitLabel: "Soumettre la dépense",
  successMessage: "Dépense soumise — en attente de validation par votre admin.",
  emptyTitle: "Aucune dépense pour l'instant",
  emptyDescription: "Enregistrez votre première dépense — elle apparaîtra ici avec son statut.",
  historyErrorText: "Impossible d'afficher vos dépenses. Réessayez dans un instant.",
  noCategoryText:
    "Aucune catégorie disponible — demandez à votre admin d'en créer dans « Budget & catégories ».",
  titleAdmin: "Dépenses",
  subtitleAdmin: "Enregistrez vos dépenses avec justificatif — validez-les ensuite dans « Approbations ».",
  successMessageAdmin: "Dépense soumise — retrouvez-la dans « Approbations » pour la valider.",
  noCategoryTextAdmin:
    "Aucune catégorie de dépense — créez-en une dans « Budget & catégories ».",
  descPlaceholder: "Ex : taxi aéroport, déjeuner client…",
  amountPlaceholder: "25000",
};

export default function MyExpensesPage() {
  // Les dépenses automatiques (licences, abonnements…) sont réservées aux admins.
  return <TransactionsPage config={EXPENSE_CONFIG} adminExtra={<RecurringExpenses />} />;
}
