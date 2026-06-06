import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        kairo: {
          bg: '#0B0B0F',
          surface: '#15151B',
          border: '#2A2A33',
          text: '#F5F5F7',
          muted: '#9A9AA8',
          accent: '#FF5F1F',
        },
      },
    },
  },
  plugins: [],
};

export default config;
