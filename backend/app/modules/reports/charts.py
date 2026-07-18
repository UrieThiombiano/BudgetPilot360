"""
Graphiques du rapport PDF — matplotlib (backend Agg, aucun affichage), rendus
en PNG base64 embarqués dans le HTML WeasyPrint.

Import PARESSEUX (même patron que WeasyPrint) : un serveur sans matplotlib
rend le PDF sans images plutôt que d'échouer — les tableaux restent complets.
Les couleurs par catégorie viennent de app/core/category_colors (miroir du
frontend) : le donut du PDF est identique à celui du dashboard.
"""

import base64
import io
import logging

from app.core.category_colors import (
    DANGER_COLOR,
    EXPENSE_COLOR,
    OTHERS_COLOR,
    PLANNED_COLOR,
    REVENUE_COLOR,
    category_color,
)

logger = logging.getLogger(__name__)

MAX_SLICES = 8
INK = "#1c1c28"
MUTED = "#6b6b76"
GRID = "#ececf2"


def _load_pyplot():
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        return plt
    except Exception:  # matplotlib absent : le PDF sort sans graphiques
        logger.warning("matplotlib indisponible — PDF généré sans graphiques", exc_info=True)
        return None


def _never_fails(fn):
    """Un graphique qui échoue ne casse JAMAIS l'export : PDF sans cette image."""

    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception:
            logger.warning("Échec du graphique %s — ignoré", fn.__name__, exc_info=True)
            return None

    return wrapper


def _to_data_uri(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=160, bbox_inches="tight", transparent=True)
    import matplotlib.pyplot as plt

    plt.close(fig)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _compact(v: float) -> str:
    if abs(v) >= 1_000_000:
        return f"{v / 1_000_000:.1f} M"
    if abs(v) >= 1_000:
        return f"{v / 1_000:.0f} k"
    return f"{v:.0f}"


@_never_fails
def donut_png(breakdown: list[dict]) -> str | None:
    """Donut de répartition (montants approuvés > 0, top 8 + « Autres »)."""
    plt = _load_pyplot()
    if plt is None:
        return None
    rows = [c for c in breakdown if c["consumed"] > 0]
    if not rows:
        return None
    head, tail = rows[:MAX_SLICES], rows[MAX_SLICES:]
    values = [c["consumed"] for c in head]
    colors = [category_color(c["id"]) for c in head]
    if tail:
        values.append(sum(c["consumed"] for c in tail))
        colors.append(OTHERS_COLOR)

    fig, ax = plt.subplots(figsize=(2.4, 2.4))
    ax.pie(values, colors=colors, startangle=90, counterclock=False,
           wedgeprops={"width": 0.32, "edgecolor": "white", "linewidth": 1.5})
    total = sum(values)
    ax.text(0, 0.06, _compact(total), ha="center", va="center", fontsize=13,
            fontweight="bold", color=INK)
    ax.text(0, -0.18, "FCFA", ha="center", va="center", fontsize=7, color=MUTED)
    ax.set(aspect="equal")
    return _to_data_uri(fig)


@_never_fails
def budget_vs_actual_png(breakdown: list[dict], *, kind: str) -> str | None:
    """Barres horizontales groupées prévu vs réalisé (dépassements en rouge)."""
    plt = _load_pyplot()
    if plt is None:
        return None
    rows = [c for c in breakdown if c["consumed"] > 0 or c["planned_budget"] > 0][:MAX_SLICES]
    if not rows:
        return None
    names = [c["name"][:18] for c in rows][::-1]
    planned = [c["planned_budget"] for c in rows][::-1]
    actual = [c["consumed"] for c in rows][::-1]
    actual_colors = [
        DANGER_COLOR
        if kind == "expense" and c["planned_budget"] > 0 and c["consumed"] > c["planned_budget"]
        else category_color(c["id"])
        for c in rows
    ][::-1]

    fig, ax = plt.subplots(figsize=(4.6, 0.42 * len(rows) + 0.7))
    y = range(len(rows))
    ax.barh([i + 0.19 for i in y], planned, height=0.34, color=PLANNED_COLOR,
            label="Prévu" if kind == "expense" else "Objectif")
    ax.barh([i - 0.19 for i in y], actual, height=0.34, color=actual_colors,
            label="Consommé" if kind == "expense" else "Réalisé")
    ax.set_yticks(list(y), names, fontsize=7, color=MUTED)
    ax.tick_params(axis="x", labelsize=7, colors=MUTED)
    ax.xaxis.set_major_formatter(lambda v, _pos: _compact(v))
    ax.grid(axis="x", color=GRID, linewidth=0.7)
    ax.set_axisbelow(True)
    for spine in ("top", "right", "left"):
        ax.spines[spine].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.legend(fontsize=7, frameon=False, loc="lower right")
    return _to_data_uri(fig)


@_never_fails
def waterfall_png(revenues: float, expenses: float) -> str | None:
    """Pont financier Recettes → Dépenses → Bénéfice net."""
    plt = _load_pyplot()
    if plt is None or (revenues <= 0 and expenses <= 0):
        return None
    net = revenues - expenses

    fig, ax = plt.subplots(figsize=(3.4, 2.2))
    labels = ["Recettes", "Dépenses", "Bénéfice net"]
    ax.bar(0, revenues, width=0.6, color=REVENUE_COLOR)
    ax.bar(1, expenses, width=0.6, bottom=net, color=EXPENSE_COLOR)
    ax.bar(2, abs(net), width=0.6, bottom=min(0, net),
           color=REVENUE_COLOR if net >= 0 else DANGER_COLOR)
    ax.axhline(0, color=MUTED, linewidth=0.7)
    ax.set_xticks([0, 1, 2], labels, fontsize=7, color=MUTED)
    ax.tick_params(axis="y", labelsize=7, colors=MUTED)
    ax.yaxis.set_major_formatter(lambda v, _pos: _compact(v))
    ax.grid(axis="y", color=GRID, linewidth=0.7)
    ax.set_axisbelow(True)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    ax.spines["left"].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    for x, v in ((0, revenues), (1, -expenses), (2, net)):
        ax.annotate(_compact(v), (x, max(revenues, expenses) * 0.02 + (revenues if x == 0 else (net + expenses) if x == 1 else max(net, 0))),
                    ha="center", fontsize=7, color=INK, fontweight="bold")
    return _to_data_uri(fig)
