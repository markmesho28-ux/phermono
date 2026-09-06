/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          gold: "#F5A623",          // Signature PhM Amber Gold
          "gold-hover": "#DF9417",   // Rich hover gold
          "gold-dark": "#B87508",    // Deep accent gold
          "gold-light": "#FEF6E9",   // Delicate cream gold background
          "gold-subtle": "#FFFDF9",  // Whispered warm ivory
          "gold-border": "#F3DEC0",  // Luxury border tone
          black: "#111111",          // Deep Jet Onyx from PhM logo
          charcoal: "#1C1C1E",       // Soft luxury black
          stone: "#2C2C2E",          // Surface charcoal
          darkgray: "#48484A",       // Subdued text
          cream: "#FAF8F5",          // Silky porcelain canvas
          sand: "#F4EFEA",           // Secondary card backdrop
        },
      },
      fontFamily: {
        sans: ["Jost", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Cormorant Garamond", "Georgia", "serif"],
        script: ["Playfair Display", "Cormorant Garamond", "serif"],
      },
      boxShadow: {
        'luxury': '0 10px 30px -10px rgba(0, 0, 0, 0.06), 0 4px 12px -2px rgba(245, 166, 35, 0.05)',
        'luxury-hover': '0 20px 40px -15px rgba(245, 166, 35, 0.18), 0 10px 25px -5px rgba(0, 0, 0, 0.08)',
        'gold-glow': '0 0 25px -3px rgba(245, 166, 35, 0.35)',
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(24px) scale(0.97)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        slideInRight: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        pulseSubtle: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.03)" },
        }
      },
      animation: {
        fadeIn: "fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        slideUp: "slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        slideInRight: "slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        pulseSubtle: "pulseSubtle 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
