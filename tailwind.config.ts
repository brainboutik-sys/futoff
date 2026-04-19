import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#07080c",
        panel: "#0e1118",
        ink: "#e9edf5",
        muted: "#8a93a6",
        line: "#1b2030",
        accent: "#22d3ee",
        win: "#34d399",
        loss: "#f87171",
        gold: "#f5c44e",
      },
      fontFamily: {
        display: ["ui-sans-serif", "system-ui", "Inter", "sans-serif"],
      },
      boxShadow: {
        card: "0 12px 40px -12px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)",
        glow: "0 0 0 2px rgba(34,211,238,0.45), 0 0 40px rgba(34,211,238,0.25)",
      },
      keyframes: {
        pop: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "60%": { transform: "scale(1.03)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(12px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        shake: {
          "0%,100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-3px)" },
          "75%": { transform: "translateX(3px)" },
        },
      },
      animation: {
        pop: "pop 320ms cubic-bezier(0.16,1,0.3,1)",
        slideUp: "slideUp 240ms ease-out",
        shake: "shake 220ms ease-in-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
