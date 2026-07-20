from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.core import audit
from app.core.security import CurrentUser, require_role
from app.modules.reports import excel, full_export, pdf, service

router = APIRouter()

MEDIA_TYPES = {
    "pdf": "application/pdf",
    "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
EXTENSIONS = {"pdf": "pdf", "excel": "xlsx"}


def _check_period(date_from: date, date_to: date) -> None:
    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La date de début doit précéder la date de fin.",
        )


@router.get("/data")
async def report_data(
    date_from: date = Query(...),
    date_to: date = Query(...),
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    """Données structurées du rapport (JSON) — la SOURCE UNIQUE du flux
    Générer → Prévisualiser → Décider : ce même payload nourrit l'aperçu React
    et, à la demande seulement, la génération PDF/Excel (aucune divergence).
    """
    _check_period(date_from, date_to)
    data = service.get_report_data(user.company_id, date_from, date_to)
    audit.log_action(
        company_id=user.company_id,
        actor_id=user.id,
        action="report.generated",
        details={"date_from": date_from.isoformat(), "date_to": date_to.isoformat()},
    )
    return data


@router.get("/export")
async def export_report(
    format: Literal["pdf", "excel"] = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    scope: Literal["full", "summary"] = Query("full"),
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    """Exporte le rapport de la période (admin — tableau RBAC CLAUDE.md).

    `scope=summary` ne produit que la Section 1 (bilan résumé) ; `full` ajoute
    la Section 2 (graphiques complets + tableaux détaillés).
    L'export est audité : c'est une sortie de données hors de la plateforme.
    """
    _check_period(date_from, date_to)

    data = service.get_report_data(user.company_id, date_from, date_to)
    content = (
        pdf.render_pdf(data, scope) if format == "pdf" else excel.render_excel(data, scope)
    )

    audit.log_action(
        company_id=user.company_id,
        actor_id=user.id,
        action="report.exported",
        details={
            "format": format,
            "scope": scope,
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
            "expenses_count": len(data["expenses"]),
        },
    )

    suffix = "_resume" if scope == "summary" else ""
    filename = (
        f"rapport_budgetpilot360_{date_from.isoformat()}_{date_to.isoformat()}"
        f"{suffix}.{EXTENSIONS[format]}"
    )
    return Response(
        content=content,
        media_type=MEDIA_TYPES[format],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/company-export")
async def export_company_data(
    user: CurrentUser = Depends(require_role("admin", "super_admin")),
):
    """Export COMPLET des données de l'entreprise (portabilité) — classeur Excel :
    Entreprise, Équipe, Catégories, Dépenses, Recettes, Automatisations, Audit.

    Toutes les périodes, tous les statuts — pas seulement une période de rapport.
    Audité : c'est une sortie de données hors de la plateforme.
    """
    if not user.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucune entreprise associée à ce compte.",
        )

    content = full_export.render_company_export(user.company_id)

    audit.log_action(
        company_id=user.company_id,
        actor_id=user.id,
        action="company.data_exported",
        details={"size_bytes": len(content)},
    )

    filename = f"donnees_budgetpilot360_{date.today().isoformat()}.xlsx"
    return Response(
        content=content,
        media_type=MEDIA_TYPES["excel"],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
