export const astreexClerkAppearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorBackground: "var(--card)",
    colorText: "var(--foreground)",
    colorTextSecondary: "var(--muted-foreground)",
    colorInputBackground: "var(--background)",
    colorInputText: "var(--foreground)",
    borderRadius: "0.625rem",
    fontFamily: "var(--font-ui)",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "w-full border border-border bg-card shadow-xs",
    footer: "bg-transparent",
    footerActionLink: "text-primary hover:text-primary/90",
    formButtonPrimary:
      "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
    socialButtonsBlockButton:
      "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
    formFieldInput: "border-input bg-background text-foreground",
  },
} as const
