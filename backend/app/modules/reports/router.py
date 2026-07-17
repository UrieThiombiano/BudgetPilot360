from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.core import audit
from app.core.security import CurrentUser, require_role
from app.modules.reports import excel, pdf, service

router = APIRouter()

MEDIA_TYPES = {
    "pdf": "application/pdf",
    "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
EXTENSIONS = {"pdf": "pdf", "excel": "xlsx"}


@router.get("/export")
async def export_report(
    format: Literal["pdf", "excel"] = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    """Exporte le rapport budgétaire de la période (admin — tableau RBAC CLAUDE.md).

    L'export est audité : c'est une sortie de données hors de la plateforme.
    """
    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La date de début doit précéder la date de fin.",
        )

    data = service.get_report_data(user.company_id, date_from, date_to)
    content = pdf.render_pdf(data) if format == "pdf" else excel.render_excel(data)

    audit.log_action(
        company_id=user.company_id,
        actor_id=user.id,
        action="report.exported",
        details={
            "format": format,
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
            "expenses_count": len(data["expenses"]),
        },
    )

    filename = f"rapport_budgetpilot360_{date_from.isoformat()}_{date_to.isoformat()}.{EXTENSIONS[format]}"
    return Response(
        content=content,
        media_type=MEDIA_TYPES[format],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
