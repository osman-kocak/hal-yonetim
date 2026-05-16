/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#16a34a',
          light: '#dcfce7',
          dark: '#15803d',
        },
        accent: '#d97706',
        'quality-a': '#1d4ed8',
        'quality-b': '#7c3aed',
        success: '#16a34a',
        warning: '#d97706',
        error: '#dc2626',
        bg: '#f8fafc',
        card: '#ffffff',
        border: '#e2e8f0',
        'text-primary': '#0f172a',
        'text-secondary': '#475569',
        'text-muted': '#94a3b8',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.12)',
        'card-active': '0 0 0 3px rgba(22,163,74,0.25)',
      },
    },
  },
  plugins: [],
}
