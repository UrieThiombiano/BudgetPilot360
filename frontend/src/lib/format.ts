/**
 * Formatage monétaire — FCFA (XOF) : la plateforme est conçue pour un usage
 * burkinabè. XOF ne porte pas de centimes, mais les données peuvent en
 * contenir : on les affiche seulement si présents.
 */
export const fcfa = (n: number) =>
  n.toLocaleString("fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 2,
  });

/** Version compacte pour les axes de graphiques (ex : « 8,1 k F CFA »). */
export const compactFcfa = (n: number) =>
  n.toLocaleString("fr-FR", {
    style: "currency",
    currency: "XOF",
    notation: "compact",
    maximumFractionDigits: 1,
  });
