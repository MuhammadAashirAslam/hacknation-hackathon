import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // AgentMarket design system tokens
        background: '#0F172A',
        surface:    '#1E293B',
        accent:     '#1A56DB',
        amber:      '#F59E0B',
        success:    '#10B981',
        primary:    '#F1F5F9',
        secondary:  '#94A3B8',
      },
      fontFamily: {
        sans: ['Inter', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
