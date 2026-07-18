import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#13251f',
        forest: {
          950: '#071712',
          900: '#0c241d',
          800: '#12342a',
          700: '#1d4a3c',
          600: '#2b6653',
        },
        cream: {
          50: '#fdfcf7',
          100: '#f7f4e9',
          200: '#ebe5d4',
          300: '#d8cfb8',
        },
        signal: '#b8e36d',
      },
      boxShadow: {
        panel: '0 18px 50px -32px rgba(7, 23, 18, 0.42)',
        lift: '0 20px 44px -24px rgba(7, 23, 18, 0.6)',
      },
      fontFamily: {
        sans: ['Inter', 'Avenir Next', 'Avenir', 'Segoe UI', 'sans-serif'],
        display: ['Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', 'Palatino', 'serif'],
        mono: ['SFMono-Regular', 'Cascadia Code', 'Roboto Mono', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
