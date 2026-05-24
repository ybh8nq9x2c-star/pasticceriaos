import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#1A2B4A",
          light: "#243660",
          50: "#EEF1F7",
        },
        gold: {
          DEFAULT: "#C9962A",
          light: "#F5C842",
        },
        cream: {
          DEFAULT: "#FAF7F2",
          dark: "#F0EBE1",
        },
        accent: "#D4512A",
        "text-muted": "#6B7280",
        "border-warm": "#E5DDD0",
        // Fornitore palette — deep slate/teal
        slate: {
          900: "#0F1923",
          800: "#162233",
          700: "#1E3048",
        },
        teal: {
          DEFAULT: "#2A7D6B",
          light: "#14B8A6",
        },
      },
      fontFamily: {
        display: ["'Playfair Display'", "Georgia", "serif"],
        playfair: ["'Playfair Display'", "Georgia", "serif"],
        sans: ["'DM Sans'", "system-ui", "sans-serif"],
        mono: ["'DM Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
