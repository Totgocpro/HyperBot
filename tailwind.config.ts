import type { Config } from "tailwindcss";

const TailwindConfiguration: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        Ink: "#101820",
        Panel: "#f6efe3",
        Brass: "#b77f2a",
        Moss: "#43533d"
      },
      fontFamily: {
        Display: ["Georgia", "Cambria", "serif"],
        Body: ["Aptos", "ui-sans-serif", "system-ui"]
      }
    }
  },
  plugins: []
};

export default TailwindConfiguration;
