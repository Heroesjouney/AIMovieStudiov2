import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: "#0a0a0f",
          panel: "#13131a",
          panelHover: "#1a1a24",
          border: "#1e1e2e",
          borderHover: "#2a2a3a",
          text: "#e4e4e7",
          muted: "#71717a",
          accent: "#6366f1",
          accentHover: "#818cf8",
          accentDim: "#4f46e5",
          success: "#22c55e",
          warning: "#f59e0b",
          danger: "#ef4444",
        },
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-in": "slideIn 0.25s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
