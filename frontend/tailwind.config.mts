import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        syne: ['"Syne"', 'system-ui', 'sans-serif']
      },
      colors: {
        'sc-bg': '#050609',
        'sc-bg-alt': '#080910',
        'sc-red': '#d3002f',
        'sc-red-soft': '#3b050f',
        'sc-green': '#00e8a2'
      }
    }
  },
  plugins: []
};

export default config;

