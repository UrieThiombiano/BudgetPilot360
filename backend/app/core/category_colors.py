"""
Couleurs par catégorie — MIROIR EXACT de frontend/src/lib/categoryColors.ts :
même palette (8 teintes validées, mode clair — les documents sont sur fond
blanc), même hash FNV-1a sur l'id de catégorie. Une catégorie a donc la même
couleur dans le dashboard React, l'aperçu, le PDF et l'Excel.
"""

PALETTE_LIGHT = [
    "#2a78d6",  # bleu
    "#008300",  # vert
    "#e87ba4",  # magenta
    "#eda100",  # jaune
    "#1baf7a",  # aqua
    "#eb6834",  # orange
    "#4a3aa7",  # violet
    "#e34948",  # rouge
]

OTHERS_COLOR = "#9b9aae"
DANGER_COLOR = "#d03b3b"
REVENUE_COLOR = "#059669"
EXPENSE_COLOR = "#6366f1"
PLANNED_COLOR = "#e2e2ee"


def _fnv1a(text: str) -> int:
    h = 0x811C9DC5
    for ch in text:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def category_color(category_id: str) -> str:
    return PALETTE_LIGHT[_fnv1a(category_id) % len(PALETTE_LIGHT)]
