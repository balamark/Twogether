/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary pink-purple theme
        primary: {
          50: '#F8F0FF',
          100: '#F3E5F5',
          200: '#E1BEE7',
          300: '#CE93D8',
          400: '#BA68C8',
          500: '#E91E63', // Hot pink
          600: '#9C27B0', // Purple
          700: '#7B1FA2',
          800: '#6A1B9A',
          900: '#4A148C',
        },
        // Romantic pinks
        romantic: {
          50: '#FFF0F5',
          100: '#FFDBF0',
          200: '#FFB8E1',
          300: '#FF94D2',
          400: '#FF70C3',
          500: '#FF4CB4',
          600: '#E91E63',
          700: '#AD1457',
          800: '#880E4F',
          900: '#4A148C',
        },
        // Supporting colors
        lavender: {
          50: '#F8F0FF',
          100: '#F3E5F5',
          200: '#E1BEE7',
          300: '#CE93D8',
        },
        // Keep existing colors for compatibility
        love: {
          50: '#FFF0F5',
          100: '#FFDBF0',
          200: '#FFB8E1',
          300: '#FF94D2',
          400: '#FF70C3',
          500: '#FF4CB4',
          600: '#E91E63',
          700: '#AD1457',
          800: '#880E4F',
          900: '#4A148C',
        },
      },
      fontFamily: {
        'romantic': ['Dancing Script', 'cursive'],
        'elegant': ['Playfair Display', 'serif'],
        'body': ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'pink-purple': 'linear-gradient(135deg, #E91E63 0%, #9C27B0 100%)',
        'soft-pink': 'linear-gradient(135deg, #FFB8E1 0%, #FF94D2 100%)',
        'lavender-bg': 'linear-gradient(135deg, #F8F0FF 0%, #F3E5F5 100%)',
        'card-gradient': 'linear-gradient(135deg, #FFFFFF 0%, #F8F0FF 100%)',
      },
      animation: {
        'heart-beat': 'heartbeat 1.5s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'scale-hover': 'scale-hover 0.3s ease-in-out',
      },
      keyframes: {
        heartbeat: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        glow: {
          from: { boxShadow: '0 0 5px rgba(233, 30, 99, 0.3)' },
          to: { boxShadow: '0 0 20px rgba(233, 30, 99, 0.5)' },
        },
        'scale-hover': {
          '0%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(1.02)' },
        },
      },
      boxShadow: {
        'romantic': '0 4px 20px rgba(233, 30, 99, 0.15)',
        'soft': '0 2px 8px rgba(0, 0, 0, 0.1)',
        'glow': '0 0 20px rgba(233, 30, 99, 0.3)',
        'card': '0 4px 12px rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
} 