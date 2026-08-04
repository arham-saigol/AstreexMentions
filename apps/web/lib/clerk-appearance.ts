export const astreexClerkAppearance = {
  variables: {
    colorPrimary: "var(--brand)",
    colorBackground: "var(--surface)",
    colorText: "var(--ink)",
    colorTextSecondary: "var(--ink-tertiary)",
    colorInputBackground: "var(--surface)",
    colorInputText: "var(--ink)",
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
      "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
    socialButtonsBlockButton:
      "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
    formFieldInput: "border-input bg-background text-foreground",
  },
} as const
