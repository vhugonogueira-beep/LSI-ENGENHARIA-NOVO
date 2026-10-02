/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/frontend/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            // IBM Plex: a mesma voz do Blueprint. Mono so para identificadores.
            // Escala unica: 11 · 12 · 13 · 15 · 18 · 24 · 32 (docs/DESIGN-SYSTEM.md).
            // Os nomes do Tailwind foram reapontados para ela, entao as classes
            // existentes caem na escala sem precisar trocar nenhuma.
            fontSize: {
                '2xs': ['11px', { lineHeight: '16px' }],
                xs: ['12px', { lineHeight: '16px' }],
                sm: ['13px', { lineHeight: '20px' }],
                base: ['15px', { lineHeight: '22px' }],
                lg: ['18px', { lineHeight: '26px' }],
                xl: ['18px', { lineHeight: '26px' }],
                '2xl': ['24px', { lineHeight: '32px' }],
                '3xl': ['32px', { lineHeight: '38px' }],
                '4xl': ['32px', { lineHeight: '38px' }],
            },
            fontFamily: {
                sans: ['"IBM Plex Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
                mono: ['"IBM Plex Mono"', 'ui-monospace', 'Consolas', 'monospace'],
            },
            colors: {
                // Estado — as quatro cores com significado (index.css).
                ok: 'hsl(var(--ok) / <alpha-value>)',
                warn: 'hsl(var(--warn) / <alpha-value>)',
                crit: 'hsl(var(--crit) / <alpha-value>)',
                info: 'hsl(var(--info) / <alpha-value>)',
                // Paleta categorica (lib/cores.ts): c-indigo, c-teal...
                c: {
                    indigo: 'hsl(var(--c-indigo) / <alpha-value>)',
                    blue: 'hsl(var(--c-blue) / <alpha-value>)',
                    cyan: 'hsl(var(--c-cyan) / <alpha-value>)',
                    teal: 'hsl(var(--c-teal) / <alpha-value>)',
                    green: 'hsl(var(--c-green) / <alpha-value>)',
                    amber: 'hsl(var(--c-amber) / <alpha-value>)',
                    orange: 'hsl(var(--c-orange) / <alpha-value>)',
                    rose: 'hsl(var(--c-rose) / <alpha-value>)',
                    violet: 'hsl(var(--c-violet) / <alpha-value>)',
                    slate: 'hsl(var(--c-slate) / <alpha-value>)',
                },
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            }
        },
    },
    plugins: [],
}
