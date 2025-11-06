import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        "neo-purple": "#9d4edd",
        "neo-pink": "#ff6ac1",
        "neo-cyan": "#5ee7ff",
        "neo-yellow": "#ffd166"
      },
      boxShadow: {
        glow: "0 0 25px rgba(157, 78, 221, 0.55)"
      },
      backgroundImage: {
        "grid-glow":
          "radial-gradient(circle at center, rgba(157,78,221,0.4), transparent 65%), conic-gradient(from 0deg, rgba(93, 238, 255, 0.25), rgba(255, 106, 193, 0.25), rgba(255, 209, 102, 0.25), rgba(93, 238, 255, 0.25))"
      }
    }
  },
  plugins: []
};

export default config;
