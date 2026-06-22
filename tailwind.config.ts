import type { Config } from "tailwindcss";

/**
 * Vidur design system — §6 of the build brief.
 * Calm by default; the only bold note is `needs` (gold), reserved for
 * decision forks that require a human.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        card: "var(--card)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--line)",
        accent: {
          DEFAULT: "var(--accent)",
          deep: "var(--accent-deep)",
          tint: "var(--accent-tint)",
        },
        needs: "var(--needs-you)",
        shipped: "var(--shipped)",
      },
      borderRadius: {
        sm: "14px",
        md: "16px",
        lg: "20px",
      },
      fontFamily: {
        serif: ["var(--font-instrument-serif)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(23,24,28,0.04), 0 8px 24px rgba(23,24,28,0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
