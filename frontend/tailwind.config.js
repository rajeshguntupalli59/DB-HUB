/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          0: "#0a0a0f",
          1: "#111118",
          2: "#16161f",
          3: "#1c1c28",
          4: "#232334",
        },
        border: "#2a2a3d",
        accent: {
          DEFAULT: "#6366f1",
          hover: "#818cf8",
          muted: "rgba(99,102,241,0.12)",
        },
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
