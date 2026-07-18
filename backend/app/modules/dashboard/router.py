from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, require_role
from app.modules.dashboard import service
from app.modules.dashboard.schemas import DashboardSummary
from app.modules.recurring import service as recurring

router = APIRouter()


@router.get("/summary", response_model=DashboardSummary)
async def get_summary(user: CurrentUser = Depends(require_role("admin", "super_admin"))):
    """Vue d'ensemble budgétaire de l'entreprise.

    Admin uniquement (tableau RBAC de CLAUDE.md) : un rôle `user` ne voit que ses
    propres dépenses — son dashboard personnel se construit côté front à partir
    de GET /expenses/mine.
    """
    # Échéances des dépenses automatiques arrivées à terme : décomptées ICI
    # (catch-up sans cron — best-effort, ne lève jamais) pour que le dashboard
    # reflète toujours l'état réel.
    recurring.materialize_due(user.company_id)
    return service.get_summary(user.company_id)
