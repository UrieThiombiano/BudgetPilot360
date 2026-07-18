/**
 * Couleurs par CATÉGORIE — déterministes et stables : la même catégorie a
 * exactement la même couleur partout (donuts, histogrammes, légendes, badges),
 * en clair comme en sombre.
 *
 * Palette : l'instance de référence du skill dataviz (8 teintes), VALIDÉE par
 * scripts/validate_palette.js sur nos surfaces (#ffffff clair / #14131d sombre) :
 * bande de luminance, chroma, séparation daltonisme (ΔE ≥ 8 adjacent), plancher
 * vision normale, contraste. L'ORDRE des teintes est le mécanisme de sécurité
 * CVD — ne jamais le réordonner sans re-valider.
 * 3 teintes claires sont < 3:1 sur fond blanc (règle de relief) : toujours
 * accompagner la couleur d'un libellé visible (nos légendes le font).
 *
 * Assignation : hash FNV-1a de l'id de catégorie → index — déterministe entre
 * sessions et écrans, insensible à l'ordre de chargement des catégories.
 */

const PALETTE_LIGHT = [
  "#2a78d6", // bleu
  "#008300", // vert
  "#e87ba4", // magenta
  "#eda100", // jaune
  "#1baf7a", // aqua
  "#eb6834", // orange
  "#4a3aa7", // violet
  "#e34948", // rouge
] as const;

const PALETTE_DARK = [
  "#3987e5",
  "#008300",
  "#d55181",
  "#c98500",
  "#199e70",
  "#d95926",
  "#9085e9",
  "#e66767",
] as const;

/** Couleur neutre pour le regroupement « Autres » d'un donut. */
export const OTHERS_COLOR = { light: "#9b9aae", dark: "#6b6a80" };

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function categoryColor(categoryId: string, dark: boolean): string {
  const palette = dark ? PALETTE_DARK : PALETTE_LIGHT;
  return palette[fnv1a(categoryId) % palette.length];
}

export const CATEGORY_PALETTE_SIZE = PALETTE_LIGHT.length;
