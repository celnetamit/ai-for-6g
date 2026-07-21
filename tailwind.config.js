/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'primary': '#0D6EFD',
        'primary-dark': '#0B5ED7',
        'secondary': '#6C757D',
        'background-dark': '#121212',
        'surface-dark': '#1E1E1E',
        'on-surface-dark': '#E0E0E0',
        'background-light': '#F8F9FA',
        'surface-light': '#FFFFFF',
        'on-surface-light': '#212529',
      }
    },
  },
  plugins: [],
}
