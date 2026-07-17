from fastapi import APIRouter, Depends

from app.core import audit
from app.core.security import CurrentUser, require_role
from app.modules.ai_assistant import mistral, service
from app.modules.ai_assistant.schemas import AskRequest, AskResponse

router = APIRouter()


@router.post("/ask", response_model=AskResponse)
async def ask(
    payload: AskRequest,
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    """Pose une question à l'assistant budgétaire (admin — capacité IA du tableau RBAC).

    Audité : des données de l'entreprise sortent vers un service tiers (Mistral).
    """
    question = payload.question.strip()
    system_prompt = service.build_system_prompt(user.company_id)
    answer = mistral.ask_mistral(system_prompt, question)

    audit.log_action(
        company_id=user.company_id,
        actor_id=user.id,
        action="ai.asked",
        details={"question": question[:200]},
    )
    return AskResponse(answer=answer)
