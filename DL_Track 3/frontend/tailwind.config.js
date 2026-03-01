/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sentinel: {
          red: "#EF4444",
          orange: "#F97316",
          yellow: "#EAB308",
          green: "#22C55E",
          blue: "#3B82F6",
          dark: "#0F172A",
          surface: "#1E293B",
        },
      },
    },
  },
  plugins: [],
};
