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
        'primary': '#4F46E5', // Indigo 600
        'primary-dark': '#3730A3', // Indigo 800
        'primary-light': '#818CF8', // Indigo 400
        'secondary': '#8B5CF6', // Violet 500
        'secondary-dark': '#5B21B6', // Violet 900
        'accent': '#06B6D4', // Cyan 500
        'background-dark': '#0F172A', // Slate 900
        'surface-dark': 'rgba(30, 41, 59, 0.7)', // Slate 800 with opacity for glass
        'on-surface-dark': '#F8FAFC', // Slate 50
        'background-light': '#F1F5F9', // Slate 100
        'surface-light': 'rgba(255, 255, 255, 0.7)', // White with opacity for glass
        'on-surface-light': '#0F172A', // Slate 900
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
        'blob': 'blob 7s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        blob: {
          '0%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
          '100%': { transform: 'translate(0px, 0px) scale(1)' },
        }
      }
    },
  },
  plugins: [],
}
