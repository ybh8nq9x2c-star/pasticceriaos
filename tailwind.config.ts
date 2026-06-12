import type { Config } from "tailwindcss";

/**
 * BakeryOs — Tailwind config.
 * I colori sono SEMANTICI e puntano alle CSS variables di globals.css:
 * il dark mode ([data-theme="dark"]) funziona senza `dark:` su ogni classe.
 * Vietati i valori arbitrari hex nelle pagine: usare i token qui sotto.
 */
const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Superfici
        bg:        "var(--color-bg)",
        surface:   { DEFAULT: "var(--color-surface)", 2: "var(--color-surface-2)", offset: "var(--color-surface-offset)" },
        border:    { DEFAULT: "var(--color-border)" },
        divider:   "var(--color-divider)",
        // Testo
        ink:       { DEFAULT: "var(--color-text)", muted: "var(--color-text-muted)", faint: "var(--color-text-faint)", inverse: "var(--color-text-inverse)" },
        // Accent + stati
        primary:   { DEFAULT: "var(--color-primary)", hover: "var(--color-primary-hover)", light: "var(--color-primary-light)", fg: "var(--color-primary-fg)", ring: "var(--color-primary-ring)", soft: "var(--color-primary-soft)" },
        danger:    { DEFAULT: "var(--color-danger)", hover: "var(--color-danger-hover)", light: "var(--color-danger-light)", fg: "var(--color-danger-fg)", soft: "var(--color-danger-soft)" },
        warning:   { DEFAULT: "var(--color-warning)", strong: "var(--color-warning-strong)", light: "var(--color-warning-light)", fg: "var(--color-warning-fg)", soft: "var(--color-warning-soft)" },
        success:   { DEFAULT: "var(--color-success)", strong: "var(--color-success-strong)", light: "var(--color-success-light)", fg: "var(--color-success-fg)", soft: "var(--color-success-soft)" },
        info:      { DEFAULT: "var(--color-info)", strong: "var(--color-info-strong)", light: "var(--color-info-light)", fg: "var(--color-info-fg)" },
        neutral:   { light: "var(--color-neutral-light)" },
        glass:     "var(--color-bg-glass)",
      },
      borderColor: {
        DEFAULT: "var(--color-border)",
      },
      fontSize: {
        xs:    ["12px", { lineHeight: "16px", letterSpacing: "0.01em" }],
        sm:    ["13px", { lineHeight: "20px" }],
        base:  ["14px", { lineHeight: "22px" }],
        md:    ["15px", { lineHeight: "24px" }],
        lg:    ["17px", { lineHeight: "26px", fontWeight: "500" }],
        xl:    ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "2xl": ["24px", { lineHeight: "32px", fontWeight: "600" }],
        "3xl": ["30px", { lineHeight: "38px", fontWeight: "700" }],
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        DEFAULT: "160ms",
      },
      maxWidth: {
        content: "1536px",
      },
    },
  },
  plugins: [],
};

export default config;
