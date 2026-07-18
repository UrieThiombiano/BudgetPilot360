/**
 * Couleurs des graphiques, alignées sur les tokens du design system
 * (indigo accent + vert recette + ambre). Source unique partagée par le
 * Dashboard et l'espace Plateforme — jamais de couleur codée en dur ailleurs.
 */
export function chartColors(dark: boolean) {
  return dark
    ? {
        revenue: "#34d399", expense: "#818cf8", net: "#fbbf24",
        // bar : indigo mono-série validé (validate_palette.js, bande L sombre 0.48–0.67)
        bar: "#7b86f6",
        grid: "#272635", axisLine: "#353349", muted: "#a2a1b6", surface: "#14131d",
        cursor: "rgba(129,140,248,0.10)",
      }
    : {
        revenue: "#059669", expense: "#6366f1", net: "#d97706",
        bar: "#6366f1", // validé en mode clair
        grid: "#e5e5ef", axisLine: "#d5d5e4", muted: "#56556b", surface: "#ffffff",
        cursor: "rgba(79,70,229,0.07)",
      };
}
