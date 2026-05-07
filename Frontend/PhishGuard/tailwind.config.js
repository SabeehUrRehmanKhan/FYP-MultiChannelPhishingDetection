/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'surface': 'var(--surface)',
        'surface-dim': 'var(--surface-dim)',
        'surface-bright': 'var(--surface-bright)',
        'on-surface': 'var(--on-surface)',
        'primary': 'var(--primary)',
        'electric-blue': 'var(--electric-blue)',
        'neon-red': 'var(--neon-red)',
        'neon-green': 'var(--neon-green)',
        'amber': 'var(--amber)',
      },
      fontFamily: {
        headline: ['var(--font-headline)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
