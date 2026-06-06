/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'System'],
      },
      // Kairo design tokens \u2014 see DESIGN.md (referenced in KAIRO_TECH_SPEC \u00a72).
      colors: {
        kairo: {
          bg: '#0B0B0F',
          surface: '#15151B',
          'surface-2': '#1F1F27',
          border: '#2A2A33',
          text: '#F5F5F7',
          muted: '#9A9AA8',
          accent: '#FF5F1F',
          live: '#34D399',
          // category dots
          football: '#22C55E',
          f1: '#EF4444',
          cricket: '#3B82F6',
          tennis: '#EAB308',
          work: '#A78BFA',
          stream: '#F472B6',
          personal: '#94A3B8',
        },
      },
    },
  },
  plugins: [],
};
