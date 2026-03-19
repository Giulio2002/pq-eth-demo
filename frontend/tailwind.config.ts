import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        metamask: {
          blue: "#037DD6",
          "blue-hover": "#0260A4",
          "blue-light": "#EAF6FF",
        },
        falcon: {
          DEFAULT: "#037DD6",
          light: "#EAF6FF",
          dark: "#0260A4",
        },
        dilithium: {
          DEFAULT: "#7B61FF",
          light: "#F0EDFF",
          dark: "#6349D6",
        },
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.04)",
        "card-hover": "0 4px 12px 0 rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
