from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, get_current_user
from app.modules.notifications import service
from app.modules.notifications.schemas import NotificationOut

router = APIRouter()


@router.get("", response_model=list[NotificationOut])
async def list_notifications(user: CurrentUser = Depends(get_current_user)):
    """Les notifications de l'utilisateur courant (les plus récentes d'abord)."""
    return service.list_notifications(user)


@router.post("/mark-read", status_code=204)
async def mark_all_read(user: CurrentUser = Depends(get_current_user)):
    """Marque toutes ses notifications comme lues."""
    service.mark_all_read(user)
