/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        bg: '#050914',
        surface: '#0a1224',
        primary: '#0ea5e9',
        cyan: '#38bdf8',
        text: '#e6f5ff',
        muted: 'rgba(230,245,255,0.6)',
        borderc: 'rgba(56,189,248,0.2)'
      },
      boxShadow: {
        glow: '0 0 40px rgba(56,189,248,0.25)'
      }
    },
  },
  plugins: [],
};
