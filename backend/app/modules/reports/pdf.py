"""
Rendu PDF du rapport budgétaire (WeasyPrint).

WeasyPrint est importé paresseusement : sur Windows il dépend des DLL
GTK/Pango (voir WEASYPRINT_DLL_DIRECTORIES dans la config) et un poste sans
ces DLL ne doit pas empêcher le reste de l'API de démarrer — seul l'export
PDF répond alors 501 avec un message actionnable.
"""

import html
import os

from fastapi import HTTPException, status

from app.core.config import settings
from app.core.money import fcfa


def _fr_date(d) -> str:
    return f"{d.day:02d}/{d.month:02d}/{d.year}"


def _load_weasyprint():
    if settings.WEASYPRINT_DLL_DIRECTORIES:
        os.environ.setdefault(
            "WEASYPRINT_DLL_DIRECTORIES", settings.WEASYPRINT_DLL_DIRECTORIES
        )
    try:
        from weasyprint import HTML
    except OSError as exc:  # DLL GTK/Pango absentes (cas Windows)
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=(
                "Export PDF indisponible sur ce serveur : bibliothèques GTK/Pango "
                "manquantes pour WeasyPrint (voir README, section Rapports)."
            ),
        ) from exc
    return HTML


STATUS_COLORS = {
    "approved": ("#e7f6ec", "#116329"),
    "pending": ("#fdf3dc", "#8a5a00"),
    "rejected": ("#fdeaea", "#a12622"),
}

_CSS = """
@page {
    size: A4;
    margin: 18mm 14mm 20mm 14mm;
    @bottom-left { content: "BudgetPilot360 — Pukri AI Systems"; font-size: 8px; color: #8a8a8a; }
    @bottom-right { content: "Page " counter(page) " / " counter(pages); font-size: 8px; color: #8a8a8a; }
}
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Arial, sans-serif; color: #1c1c28; font-size: 10px; margin: 0; }
h1 { font-size: 20px; margin: 0; }
h2 { font-size: 13px; margin: 22px 0 8px; color: #1c1c28; }
.brand { color: #4f46e5; font-weight: 700; font-size: 11px; letter-spacing: 0.4px; }
.subtitle { color: #6b6b76; margin-top: 3px; font-size: 10.5px; }
.header { border-bottom: 2px solid #4f46e5; padding-bottom: 10px; }
.kpis { display: flex; gap: 8px; margin-top: 14px; }
.kpi { flex: 1; border: 1px solid #e4e4ec; border-radius: 8px; padding: 8px 10px; }
.kpi .label { color: #6b6b76; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.5px; }
.kpi .value { font-size: 15px; font-weight: 700; margin-top: 3px; }
table { width: 100%; border-collapse: collapse; margin-top: 6px; }
th { text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.5px;
     color: #6b6b76; border-bottom: 1.5px solid #d8d8e2; padding: 5px 6px; }
td { padding: 5px 6px; border-bottom: 0.5px solid #ececf2; vertical-align: top; }
tr:nth-child(even) td { background: #fafafc; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
th.num { text-align: right; }
.chip { display: inline-block; border-radius: 8px; padding: 1.5px 7px; font-size: 8.5px; font-weight: 600; }
.bar-track { background: #ecebf5; border-radius: 4px; height: 5px; width: 100%; }
.bar-fill { background: #4f46e5; border-radius: 4px; height: 5px; }
.bar-over { background: #d03b3b; }
.muted { color: #6b6b76; }
.empty { color: #6b6b76; font-style: italic; padding: 14px 0; }
"""


def _kpi(label: str, value: str) -> str:
    return (
        f'<div class="kpi"><div class="label">{html.escape(label)}</div>'
        f'<div class="value">{html.escape(value)}</div></div>'
    )


def build_html(data: dict) -> str:
    e = html.escape
    period = f"{_fr_date(data['date_from'])} au {_fr_date(data['date_to'])}"

    expense_rows = "".join(
        f"<tr><td>{_fr_date_str(x['expense_date'])}</td>"
        f"<td>{e(x['category_name'])}</td>"
        f"<td>{e(x['author_name'])}</td>"
        f"<td>{e(x['description'][:90])}</td>"
        f"<td class='num'>{fcfa(x['amount'])}</td>"
        f"<td><span class='chip' style='background:{STATUS_COLORS[x['status']][0]};"
        f"color:{STATUS_COLORS[x['status']][1]}'>{e(x['status_label'])}</span></td></tr>"
        for x in data["expenses"]
    ) or "<tr><td colspan='6' class='empty'>Aucune dépense sur la période.</td></tr>"

    breakdown_rows = ""
    for c in data["breakdown"]:
        if c["ratio"] is None:
            bar, pct = "<span class='muted'>—</span>", "—"
        else:
            width = min(c["ratio"], 1.0) * 100
            over = " bar-over" if c["ratio"] > 1 else ""
            bar = (
                f"<div class='bar-track'><div class='bar-fill{over}' "
                f"style='width:{width:.0f}%'></div></div>"
            )
            pct = f"{c['ratio'] * 100:.0f} %"
        breakdown_rows += (
            f"<tr><td>{e(c['name'])}</td>"
            f"<td class='num'>{fcfa(c['planned_budget'])}</td>"
            f"<td class='num'>{fcfa(c['consumed'])}</td>"
            f"<td class='num'>{pct}</td><td style='width:22%'>{bar}</td></tr>"
        )
    if not breakdown_rows:
        breakdown_rows = "<tr><td colspan='5' class='empty'>Aucune catégorie.</td></tr>"

    return f"""
<style>{_CSS}</style>
<div class="header">
  <div class="brand">BUDGETPILOT360</div>
  <h1>Rapport budgétaire — {e(data['company_name'])}</h1>
  <p class="subtitle">Période du {period} · généré le {_fr_date(data['generated_on'])}</p>
</div>

<div class="kpis">
  {_kpi("Budget annuel", fcfa(data['annual_budget']))}
  {_kpi(f"Approuvées ({data['count_approved']})", fcfa(data['total_approved']))}
  {_kpi(f"En attente ({data['count_pending']})", fcfa(data['total_pending']))}
  {_kpi(f"Rejetées ({data['count_rejected']})", fcfa(data['total_rejected']))}
</div>

<h2>Répartition par catégorie (dépenses approuvées de la période)</h2>
<table>
  <thead><tr><th>Catégorie</th><th class="num">Budget prévu</th><th class="num">Consommé</th>
  <th class="num">%</th><th></th></tr></thead>
  <tbody>{breakdown_rows}</tbody>
</table>

<h2>Détail des dépenses ({len(data['expenses'])})</h2>
<table>
  <thead><tr><th>Date</th><th>Catégorie</th><th>Auteur</th><th>Description</th>
  <th class="num">Montant</th><th>Statut</th></tr></thead>
  <tbody>{expense_rows}</tbody>
</table>
"""


def _fr_date_str(iso: str) -> str:
    y, m, d = str(iso)[:10].split("-")
    return f"{d}/{m}/{y}"


def render_pdf(data: dict) -> bytes:
    HTML = _load_weasyprint()
    return HTML(string=build_html(data)).write_pdf()
