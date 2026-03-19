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
        falcon: {
          direct: "#3B82F6",
          ntt: "#14B8A6",
        },
        dilithium: {
          direct: "#8B5CF6",
          ntt: "#EC4899",
        },
        ecdsa: "#6B7280",
        migration: "#F59E0B",
        etherscan: {
          link: "#0784C3",
          bg: "#F8F9FA",
          border: "#e7eaf3",
          navy: "#21325b",
          navyLight: "#1B3A6B",
          text: "#1a1a1a",
          secondary: "#6c757d",
          header: "#3498db",
        },
      },
    },
  },
  plugins: [],
};
export default config;
