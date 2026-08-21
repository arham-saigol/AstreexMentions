# UI system

`@astreex/ui` is the single design-system boundary for the web and admin apps.

- Define shared tokens, global styles, and reusable primitives in `packages/ui`.
- Compose product and admin screens in their own apps. Do not make app-specific
  compositions shared preemptively.
- Use the local Tailwind v4 token contract and owned Radix-based primitives.
  The repository follows shadcn conventions, but does not depend on a third-party
  visual design system.
- Both root layouts run the shared pre-paint theme script and mount
  `ThemeProvider`. The product toggle persists a user choice; otherwise either
  app follows the OS preference.
- Use Lucide for new general-purpose icons. Keep a brand-specific icon only
  when Lucide has no appropriate equivalent.

`packages/ui/src/styles/globals.css` is the implementation source of truth.
