import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#0052ff",
          hover: "#578bfa",
          dark: "#0a0b0d",
          card: "#282b31",
          surface: "#eef0f3",
          border: "rgba(91,97,110,0.2)"
        }
      },
      borderRadius: {
        pill: "56px"
      },
      boxShadow: {
        terminal: "0 10px 28px rgba(0, 0, 0, 0.22)"
      },
      fontFamily: {
        sans: ["Segoe UI", "Inter", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
