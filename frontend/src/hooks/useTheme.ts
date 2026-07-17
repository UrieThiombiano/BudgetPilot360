import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "bp360-theme";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Applique la classe `dark` sur <html> (Tailwind darkMode: "class") — à appeler au boot. */
export function applyStoredTheme() {
  document.documentElement.classList.toggle("dark", getInitialTheme() === "dark");
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    []
  );

  return { theme, toggleTheme };
}

/**
 * Vrai si le mode sombre est actif, réactif au toggle de la topbar.
 * `useTheme` porte un état local par instance : un composant qui a seulement
 * besoin de LIRE le thème (couleurs de graphiques…) observe la classe `dark`
 * de <html> — la source de vérité — au lieu de dupliquer l'état.
 */
export function useIsDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains("dark")
  );
}
