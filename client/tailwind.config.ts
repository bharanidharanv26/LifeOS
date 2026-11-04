import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      colors: { accent: '#4f46e5' },
      boxShadow: { soft: '0 12px 48px -20px rgb(15 23 42 / 0.18)' },
    },
  },
  plugins: [],
} satisfies Config;
