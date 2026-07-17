"""
Rendu Excel du rapport budgétaire (openpyxl) : trois feuilles formatées —
Résumé, Dépenses (détail de la période), Par catégorie.
"""

import io

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

INDIGO = "4F46E5"
HEADER_FONT = Font(bold=True, color="FFFFFF", size=10)
HEADER_FILL = PatternFill("solid", fgColor=INDIGO)
TITLE_FONT = Font(bold=True, size=14, color="1C1C28")
LABEL_FONT = Font(bold=True, size=10, color="52514E")
THIN_BORDER = Border(bottom=Side(style="thin", color="E4E4EC"))
# FCFA (usage burkinabè) : pas de centimes en pratique, mais numeric(14,2) en base
MONEY_FORMAT = '#,##0.00 "FCFA"'
PCT_FORMAT = "0 %"

STATUS_FILLS = {
    "approved": PatternFill("solid", fgColor="E7F6EC"),
    "pending": PatternFill("solid", fgColor="FDF3DC"),
    "rejected": PatternFill("solid", fgColor="FDEAEA"),
}


def _header_row(ws, row: int, labels: list[str]) -> None:
    for col, label in enumerate(labels, start=1):
        cell = ws.cell(row=row, column=col, value=label)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(vertical="center")
    ws.row_dimensions[row].height = 20


def _fit_columns(ws, widths: list[int]) -> None:
    for i, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width


def _fr_date(d) -> str:
    return f"{d.day:02d}/{d.month:02d}/{d.year}"


def render_excel(data: dict) -> bytes:
    wb = Workbook()

    # --- Feuille Résumé ---
    ws = wb.active
    ws.title = "Résumé"
    ws["A1"] = f"Rapport budgétaire — {data['company_name']}"
    ws["A1"].font = TITLE_FONT
    ws["A2"] = (
        f"Période du {_fr_date(data['date_from'])} au {_fr_date(data['date_to'])} · "
        f"généré le {_fr_date(data['generated_on'])} · BudgetPilot360"
    )
    ws["A2"].font = Font(size=9, color="6B6B76")

    lignes = [
        ("Budget annuel", data["annual_budget"], None),
        ("Dépenses approuvées (période)", data["total_approved"], data["count_approved"]),
        ("Dépenses en attente (période)", data["total_pending"], data["count_pending"]),
        ("Dépenses rejetées (période)", data["total_rejected"], data["count_rejected"]),
    ]
    row = 4
    for label, amount, count in lignes:
        ws.cell(row=row, column=1, value=label).font = LABEL_FONT
        amount_cell = ws.cell(row=row, column=2, value=amount)
        amount_cell.number_format = MONEY_FORMAT
        if count is not None:
            ws.cell(row=row, column=3, value=f"{count} dépense(s)").font = Font(
                size=9, color="6B6B76"
            )
        row += 1
    _fit_columns(ws, [34, 18, 16])

    # --- Feuille Dépenses ---
    ws = wb.create_sheet("Dépenses")
    _header_row(ws, 1, ["Date", "Catégorie", "Auteur", "Description", "Montant", "Statut"])
    for r, x in enumerate(data["expenses"], start=2):
        ws.cell(row=r, column=1, value=str(x["expense_date"])[:10])
        ws.cell(row=r, column=2, value=x["category_name"])
        ws.cell(row=r, column=3, value=x["author_name"])
        ws.cell(row=r, column=4, value=x["description"])
        amount_cell = ws.cell(row=r, column=5, value=x["amount"])
        amount_cell.number_format = MONEY_FORMAT
        status_cell = ws.cell(row=r, column=6, value=x["status_label"])
        status_cell.fill = STATUS_FILLS[x["status"]]
        for col in range(1, 7):
            ws.cell(row=r, column=col).border = THIN_BORDER
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:F{max(len(data['expenses']) + 1, 2)}"
    _fit_columns(ws, [12, 20, 26, 42, 14, 12])

    # --- Feuille Par catégorie ---
    ws = wb.create_sheet("Par catégorie")
    _header_row(ws, 1, ["Catégorie", "Budget prévu", "Consommé (période)", "% consommé"])
    for r, c in enumerate(data["breakdown"], start=2):
        ws.cell(row=r, column=1, value=c["name"])
        planned = ws.cell(row=r, column=2, value=c["planned_budget"])
        planned.number_format = MONEY_FORMAT
        consumed = ws.cell(row=r, column=3, value=c["consumed"])
        consumed.number_format = MONEY_FORMAT
        if c["ratio"] is not None:
            ratio = ws.cell(row=r, column=4, value=c["ratio"])
            ratio.number_format = PCT_FORMAT
            if c["ratio"] > 1:
                ratio.font = Font(bold=True, color="A12622")
        else:
            ws.cell(row=r, column=4, value="—")
        for col in range(1, 5):
            ws.cell(row=r, column=col).border = THIN_BORDER
    ws.freeze_panes = "A2"
    _fit_columns(ws, [26, 16, 20, 14])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
