import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          900: '#05070A',
          800: '#080B0D',
          700: '#0D1214',
          600: '#11171A',
          500: '#161C20',
          400: '#1E2429',
          300: '#252C31',
          200: '#3A434B',
          100: '#5A6470',
        },
        paper: {
          900: '#F5F7FA',
          600: '#C2C9D6',
          400: '#8B93A7',
          300: '#6E7488',
        },
        brand: {
          50: '#E6FBF7',
          100: '#B7F3E5',
          200: '#7EE7CE',
          300: '#3ED5BB',
          400: '#2FBEA6',
          500: '#22A38C',
          600: '#178072',
          700: '#0F5E55',
        },
        sport: {
          football: '#5AA7FF',
          f1: '#F16060',
          cricket: '#3EC28B',
          tennis: '#F0C247',
        },
      },
      borderRadius: {
        card: '16px',
        sheet: '24px',
      },
      maxWidth: {
        wrap: '80rem',
      },
    },
  },
  plugins: [],
};

export default config;
