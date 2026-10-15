import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAFAF7",
        mist: "#F1F4F0",
        ink: "#16233A",
        "ink-soft": "#4A5568",
        line: "#E2E1DB",
        accent: {
          DEFAULT: "#2E5D50",
          soft: "#E8EFEC",
          deep: "#1E4038",
        },
        // Darkened from the earlier ochre so small text passes WCAG AA contrast.
        amber: {
          DEFAULT: "#955A1E",
          soft: "#F6ECE0",
        },
        sun: "#C9922E",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(22,35,58,0.05), 0 12px 32px -18px rgba(22,35,58,0.18)",
        lift: "0 2px 4px rgba(22,35,58,0.06), 0 28px 56px -24px rgba(22,35,58,0.32)",
      },
    },
  },
  plugins: [],
};

export default config;
