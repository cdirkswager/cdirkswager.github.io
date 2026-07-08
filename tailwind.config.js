/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0b0d10',
        panel: { DEFAULT: '#14181d', '2': '#1b2128' },
        line: '#2a313a',
        dim: '#707d8a',
        fg: '#e7ebee',
        accent: { DEFAULT: '#e8a23d', soft: '#e8a23d22' },
        ok: '#56d77f',
        warn: '#f2d04b',
        risk: '#f59e42',
        crit: '#ef5350',
        player: '#5aa9f0',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Bricolage Grotesque', 'serif'],
        sans: ['var(--font-sans)', 'Spline Sans', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
}
