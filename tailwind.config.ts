import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "rgb(var(--paper) / <alpha-value>)",
        mist: "rgb(var(--mist) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
          deep: "rgb(var(--accent-deep) / <alpha-value>)",
        },
        // Darkened from the earlier ochre so small text passes WCAG AA contrast.
        amber: {
          DEFAULT: "rgb(var(--amber) / <alpha-value>)",
          soft: "rgb(var(--amber-soft) / <alpha-value>)",
        },
        sun: "#C9922E",
      },
      fontFamily: {
        brand: ["var(--font-brand)", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(23,26,43,0.04), 0 10px 28px -18px rgba(42,41,74,0.16)",
        lift: "0 2px 6px rgba(23,26,43,0.06), 0 24px 48px -22px rgba(42,41,74,0.26)",
      },
    },
  },
  plugins: [],
};

export default config;
