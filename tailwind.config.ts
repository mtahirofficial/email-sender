import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#FAFAF7",
        ink: "#16233A",
        "ink-soft": "#4A5568",
        line: "#E2E1DB",
        accent: {
          DEFAULT: "#2E5D50",
          soft: "#E8EFEC",
          deep: "#1E4038",
        },
        amber: {
          DEFAULT: "#B8722F",
          soft: "#F6ECE0",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
