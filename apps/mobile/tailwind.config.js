/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['System'],
      },
      colors: {
        kairo: {
          bg: '#0B0E14',
          elevated: '#151A22',
          sunken: '#1A2030',
          border: '#2A3344',
          text: '#F5F7FA',
          muted: '#8B93A7',
          accent: '#3ED5BB',
          'accent-dim': '#2A9F8C',
          live: '#34D399',
          danger: '#F87171',
          football: '#3B82F6',
          f1: '#EF4444',
          cricket: '#22C55E',
          tennis: '#EAB308',
        },
      },
      borderRadius: {
        card: '16px',
        sheet: '24px',
        btn: '12px',
      },
    },
  },
  plugins: [],
};
