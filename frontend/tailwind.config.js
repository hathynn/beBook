/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        primary: {
          DEFAULT: "#FF97D0",
          dark: "#F26FB8",
          light: "#FFE3F1",
        },
        success: {
          DEFAULT: "#22C55E",
          dark: "#16A34A",
          light: "#DCFCE7",
        },
        error: {
          DEFAULT: "#EF4444",
          dark: "#DC2626",
          light: "#FEE2E2",
        },
        canvas: "#FAFAFA",
        surface: "#FFFFFF",
        border: {
          DEFAULT: "#E5E7EB",
          subtle: "#F0F0F1",
        },
        ink: {
          DEFAULT: "#111827",
          muted: "#6B7280",
          faint: "#9CA3AF",
        },
      },
      borderRadius: {
        xl: "16px",
        "2xl": "20px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(17, 24, 39, 0.04), 0 1px 3px 0 rgba(17, 24, 39, 0.06)",
        "card-hover":
          "0 4px 10px -2px rgba(17, 24, 39, 0.08), 0 2px 6px -2px rgba(17, 24, 39, 0.06)",
        soft: "0 1px 2px 0 rgba(17, 24, 39, 0.03)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.35s ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
        pulseDot: "pulseDot 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
