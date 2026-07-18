"""
Recettes — côté utilisateur. Même patron CRUD que les dépenses, donc la logique
est PARTAGÉE via `app.core.transactions.TransactionService`.

DÉCISION MÉTIER : une recette N'A PAS BESOIN D'APPROBATION — elle est créée
directement au statut `approved` (« confirmée ») et comptée immédiatement dans
les recettes de l'entreprise. Pas de file d'attente, pas d'endpoint de revue.

Autres différences avec les dépenses : catégorie de type `revenue`, champ de
date `revenue_date`, champ « source » (client/origine), justificatif dans
`proof_path` ; pas de commentaires ni d'alerte de seuil budgétaire.
"""

from fastapi import UploadFile

from app.core.security import CurrentUser
from app.core.transactions import TransactionService, TxSpec

REVENUE_SPEC = TxSpec(
    table="revenues",
    date_field="revenue_date",
    proof_field="proof_path",
    category_type="revenue",
    kind="revenue",
    noun="Recette",
    approved_verb="confirmée",
    approved_body="Votre recette a été confirmée.",
    initial_status="approved",  # pas d'approbation : confirmée dès la création
    # Recette déjà confirmée à la création → l'auteur peut quand même y joindre
    # son justificatif juste après.
    proof_editable_statuses=("pending", "approved"),
    extra_fields=("source",),
    proof_path_segment="revenues",  # {company_id}/revenues/{revenue_id}/…
    on_approved=None,
    link_notification=False,
)

_service = TransactionService(REVENUE_SPEC)


def create_revenue(user: CurrentUser, payload) -> dict:
    return _service.create(user, payload)


def list_my_revenues(user: CurrentUser) -> list[dict]:
    return _service.list_mine(user)


async def upload_proof(user: CurrentUser, revenue_id: str, file: UploadFile) -> str:
    return await _service.upload_proof(user, revenue_id, file)


def get_proof_url(user: CurrentUser, revenue_id: str) -> dict:
    return _service.get_proof_url(user, revenue_id)
