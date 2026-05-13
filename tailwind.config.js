/** @type {import('tailwindcss').Config} */
// Soft Petal theme — editorial cream + dusty rose + sage.
// pink/purple/rose scales are overridden so every existing
// `bg-pink-500`, `text-purple-600` etc. picks up the new palette
// without markup changes. See design-prototypes/01-soft-petal.html.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Stock Tailwind scales remapped to Soft Petal so existing markup just works.
        pink: {
          50:  '#FBF7F2', // cream
          100: '#F2EBDF', // cream-deep
          200: '#EBCFC8', // rose-soft
          300: '#E0BCB2',
          400: '#D4938A', // rose
          500: '#D4938A', // primary accent — was hot pink #EC4899
          600: '#B86E64', // rose-deep — was #DB2777
          700: '#955548',
          800: '#5A2A24',
          900: '#3D1A16',
        },
        purple: {
          50:  '#F4F0E8',
          100: '#EAE4D6',
          200: '#D8E0D2',
          300: '#A8B89E', // sage
          400: '#94A689',
          500: '#7D8F75', // sage-deep
          600: '#677761', // was #9333EA
          700: '#52614D',
          800: '#3E4A3A',
          900: '#2A3328',
        },
        rose: {
          50:  '#FBF7F2',
          100: '#F2EBDF',
          200: '#EBCFC8',
          300: '#E0BCB2',
          400: '#D4938A',
          500: '#D4938A',
          600: '#B86E64',
          700: '#955548',
          800: '#5A2A24',
          900: '#3D1A16',
        },

        // Semantic tokens matching the Soft Petal prototype palette.
        petal: {
          cream:     '#FBF7F2',
          'cream-2': '#F2EBDF',
          rose:      '#D4938A',
          'rose-soft':'#EBCFC8',
          'rose-deep':'#B86E64',
          sage:      '#A8B89E',
          'sage-deep':'#7D8F75',
          ink:       '#2A2520',
          'ink-soft':'#5A4F45',
          muted:     '#8A7E72',
          rule:      '#D9CFC1',
          'rule-soft':'#E8DFD0',
        },

        // Legacy token aliases — kept so older references don't break.
        primary: {
          50:  '#FBF7F2',
          100: '#F2EBDF',
          200: '#EBCFC8',
          300: '#E0BCB2',
          400: '#D4938A',
          500: '#D4938A',
          600: '#B86E64',
          700: '#955548',
          800: '#5A2A24',
          900: '#3D1A16',
        },
        romantic: {
          50:  '#FBF7F2',
          100: '#F2EBDF',
          200: '#EBCFC8',
          300: '#E0BCB2',
          400: '#D4938A',
          500: '#D4938A',
          600: '#B86E64',
          700: '#955548',
          800: '#5A2A24',
          900: '#3D1A16',
        },
        lavender: {
          50:  '#F4F0E8',
          100: '#EAE4D6',
          200: '#D8E0D2',
          300: '#A8B89E',
        },
        love: {
          50:  '#FBF7F2',
          100: '#F2EBDF',
          200: '#EBCFC8',
          300: '#E0BCB2',
          400: '#D4938A',
          500: '#D4938A',
          600: '#B86E64',
          700: '#955548',
          800: '#5A2A24',
          900: '#3D1A16',
        },
      },
      fontFamily: {
        'display':  ['Fraunces', 'Noto Serif TC', 'serif'],
        'serif-tc': ['Fraunces', 'Noto Serif TC', 'serif'],
        'body':     ['Manrope', 'Noto Sans TC', 'system-ui', 'sans-serif'],
        // Legacy aliases — point to the same editorial faces.
        'romantic': ['Fraunces', 'Noto Serif TC', 'serif'],
        'elegant':  ['Fraunces', 'Noto Serif TC', 'serif'],
      },
      backgroundImage: {
        'pink-purple':  'linear-gradient(135deg, #D4938A 0%, #7D8F75 100%)',
        'soft-pink':    'linear-gradient(135deg, #EBCFC8 0%, #D4938A 100%)',
        'lavender-bg':  'linear-gradient(135deg, #FBF7F2 0%, #F2EBDF 100%)',
        'card-gradient':'linear-gradient(135deg, #FFFFFF 0%, #FBF7F2 100%)',
        'petal-paper':  'linear-gradient(135deg, #FBF7F2 0%, #F2EBDF 100%)',
      },
      animation: {
        'heart-beat': 'heartbeat 1.5s ease-in-out infinite',
        'float':      'float 3s ease-in-out infinite',
        'glow':       'glow 2s ease-in-out infinite alternate',
        'scale-hover':'scale-hover 0.3s ease-in-out',
      },
      keyframes: {
        heartbeat: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%':      { transform: 'scale(1.05)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-5px)' },
        },
        glow: {
          from: { boxShadow: '0 0 5px rgba(184, 110, 100, 0.25)' },
          to:   { boxShadow: '0 0 18px rgba(184, 110, 100, 0.4)' },
        },
        'scale-hover': {
          '0%':   { transform: 'scale(1)' },
          '100%': { transform: 'scale(1.02)' },
        },
      },
      boxShadow: {
        'romantic': '0 4px 20px rgba(184, 110, 100, 0.12)',
        'soft':     '0 2px 8px rgba(42, 37, 32, 0.06)',
        'glow':     '0 0 20px rgba(184, 110, 100, 0.22)',
        'card':     '0 4px 12px rgba(42, 37, 32, 0.07)',
        'petal':    '0 16px 40px -24px rgba(184, 110, 100, 0.18)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
