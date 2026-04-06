/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        app: {
          bg: "var(--app-bg)",
          "bg-elevated": "var(--app-bg-elevated)",
          panel: "var(--app-panel)",
          "panel-solid": "var(--app-panel-solid)",
          "panel-muted": "var(--app-panel-muted)",
          "panel-subtle": "var(--app-panel-subtle)",
          border: "var(--app-border)",
          "border-strong": "var(--app-border-strong)",
          text: "var(--app-text)",
          "text-soft": "var(--app-text-soft)",
          "text-faint": "var(--app-text-faint)",
          accent: "var(--app-accent)",
          "accent-hover": "var(--app-accent-hover)",
          "accent-soft": "var(--app-accent-soft)",
          success: "var(--app-success)",
        },
        apple: {
          gray1: "#8e8e93",
          gray2: "#aeaeb2",
          gray3: "#c7c7cc",
          gray4: "#d1d1d6",
          gray5: "#e5e5ea",
          gray6: "#f2f2f7",
          dark1: "#1c1c1e",
          dark2: "#2c2c2e",
          dark3: "#3a3a3c",
          dark4: "#48484a",
        },
      },
      boxShadow: {
        apple: "0 4px 24px rgba(0, 0, 0, 0.06)",
        "apple-lg": "0 8px 32px rgba(0, 0, 0, 0.08)",
        "apple-dark": "0 4px 24px rgba(0, 0, 0, 0.3)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
        mono: ['"SF Mono"', "Menlo", "Monaco", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
