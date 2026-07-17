"""
Formatage monétaire — FCFA (franc CFA) : la plateforme est conçue pour un
usage burkinabè. Les montants restent stockés en numeric(14,2) ; le FCFA ne
porte pas de centimes en pratique, on n'affiche donc les décimales que si le
montant en contient (fidélité aux données saisies).
"""


def fcfa(n: float) -> str:
    entier, dec = f"{n:,.2f}".split(".")
    entier = entier.replace(",", " ")
    dec = dec.rstrip("0")
    return f"{entier},{dec} FCFA" if dec else f"{entier} FCFA"
