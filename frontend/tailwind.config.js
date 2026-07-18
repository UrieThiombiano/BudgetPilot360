/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-hover": "var(--surface-hover)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        fg: "var(--fg)",
        "fg-muted": "var(--fg-muted)",
        "fg-subtle": "var(--fg-subtle)",
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          strong: "rgb(var(--accent-strong) / <alpha-value>)",
          soft: "var(--accent-soft)",
          fg: "var(--accent-fg)",
          ink: "var(--accent-ink)",
        },
        success: {
          DEFAULT: "var(--success)",
          fg: "var(--success-fg)",
          soft: "var(--success-soft)",
          ink: "var(--success-ink)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          soft: "var(--warning-soft)",
          ink: "var(--warning-ink)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          fg: "var(--danger-fg)",
          soft: "var(--danger-soft)",
          ink: "var(--danger-ink)",
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', "system-ui", "-apple-system", "sans-serif"],
        display: ['"Space Grotesk Variable"', '"Inter Variable"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(var(--shadow-color) / 0.04), 0 1px 3px rgb(var(--shadow-color) / 0.05)",
        elevated:
          "0 4px 14px rgb(var(--shadow-color) / 0.08), 0 2px 6px rgb(var(--shadow-color) / 0.05)",
        popover: "0 16px 40px rgb(var(--shadow-color) / 0.16), 0 4px 10px rgb(var(--shadow-color) / 0.08)",
        "accent-glow": "0 8px 24px rgb(var(--accent) / 0.30)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};
