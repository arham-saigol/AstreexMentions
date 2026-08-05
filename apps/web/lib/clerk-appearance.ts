export const astreexClerkAppearance = {
  variables: {
    colorPrimary: "var(--brand)",
    colorBackground: "var(--surface)",
    colorForeground: "var(--ink)",
    colorMuted: "var(--surface-sunk)",
    colorMutedForeground: "var(--ink-tertiary)",
    colorInput: "var(--surface)",
    colorInputForeground: "var(--ink)",
    colorBorder: "var(--line)",
    colorRing: "var(--ink)",
    borderRadius: "6px",
    fontFamily: "var(--font-ui)",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "w-full border-0 bg-card shadow-none",
    footer: "bg-transparent",
    footerActionLink: "text-primary hover:text-primary/90",
    formButtonPrimary:
      "bg-primary text-primary-foreground shadow-none hover:bg-[var(--brand-hover)]",
    socialButtonsBlockButton:
      "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
    formFieldInput: "border-input bg-background text-foreground",
  },
} as const
