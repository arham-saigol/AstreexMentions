# UI/UX Overhaul — Astryx + Motion

Moving Astreex from the editorial warm-monochrome system to a clean, modern,
minimal, premium aesthetic grounded in the **Astryx (Meta) Design Library**,
with **transitions.dev** transitions and **interior.dev** micro-interactions.

Design direction (confirmed): **neutral base + a single restrained amber accent**
for primary actions and category tags; **Lucide** as the default icon set,
**Phosphor retained only** for marks with no Lucide equivalent (X/Reddit/HN).

## What shipped (Phase 0 — foundation + homepage slice)

Foundation is the narrow shared boundary everything else builds on; it is
verified green (`next build` passes, 8/8 routes).

**Token + theme foundation** — `packages/ui/src/styles/`

- `layers.css` — canonical `@layer` order in its own file (required for
  Next.js `@import` hoisting). `reset, theme, base, astryx-base, astryx-theme,
components, utilities`.
- `globals.css` — Astryx Tailwind-v4 coexistence: split `tailwindcss/theme.css`
  - `preflight.css` + `utilities.css`, plus `@astryxdesign/core/{reset,astryx,
tailwind-theme}.css` and `@astryxdesign/theme-neutral/theme.css`.
- Accent override scoped to `[data-astryx-theme="neutral"]`: amber accent
  (`#b26c2e`), near-black `--color-on-accent` for AA on the primary CTA, Geist
  sans (no editorial serif).
- **Compatibility shim**: every prior shadcn semantic name (`bg-primary`,
  `text-muted-foreground`, `border-border`, `bg-destructive`, `bg-card`,
  sidebar, intent categories, …) and every raw canvas/ink/line/brand token is
  repointed to a live Astryx token, so the entire existing app repaints against
  the new system with **zero call-site churn**. Migration proceeds surface by
  surface per the Astryx "Tailwind coexists" guidance.

**Theme mount** — `packages/ui/src/astryx-theme.tsx` (`<Theme theme={neutralTheme}
mode="light">` from `@astryxdesign/theme-neutral/built`, SSR-flash-free via
`data-theme`/`data-astryx-theme` on `<html>` in both app layouts). Wired into
`apps/web/components/providers.tsx` and `apps/admin/components/providers.tsx`.

**Vertical slice** — `apps/web/app/(public)/page.tsx`: homepage rebuilt clean
and premium (sans display, neutral surfaces, amber CTAs, Lucide generic icons,
Phosphor brand marks retained). `Reveal` kept for scroll sections; hero uses
transitions.dev `texts reveal`.

**transitions.dev** — skill at `.agents/skills/transitions-dev/SKILL.md` (full
catalog + decision rules + `transitions review/apply/refine` commands); CSS
namespaced `t-*` in `apps/web/app/globals.css` (shared `:root` motion vars +
reduced-motion guards). Applied: **texts reveal** (`components/transitions/
stagger.tsx`, hero) and **accordion expand** (`components/transitions/
faq-accordion.tsx`, FAQ grid-rows 0fr↔1fr + chevron flip).

**interior.dev** — `usePressDepth` hook vendored + `components/motion/
press-button.tsx`: tactile press depth + pointer-tracked 3D tilt, keyboard
parity, abandoned-gesture handling, reduced-motion opt-out. Applied to the
homepage primary CTA.

**Deps added** — `@astryxdesign/core@0.3.0`, `@astryxdesign/theme-neutral@0.3.0`,
`@astryxdesign/cli@0.3.0` (root dev), `lucide-react` (ui + web + admin), and
`motion` (web only, where interior.dev is used).

## Remaining fan-out (Phases 1–5)

The token shim means **every page already repaints**; the remaining work is
adopting Astryx primitives, retiring legacy token references, swapping icons,
and rolling motion across surfaces.

**Phase 1 — shared primitives** (`packages/ui/src/components/*`): **in progress**.
Astryx `Skeleton` and `Switch` are direct imports; `Divider` and `ProgressBar`
are compatibility wrappers preserving decorative/accessibility seams. Obsolete
Radix Switch, Separator, and Progress packages are removed. Shared
Dialog/AlertDialog/Dropdown/Popover/Select keep
their load-bearing compound Radix APIs but use real transitions.dev motion;
Checkbox uses the check-draw transition. Every UI-package icon is Lucide.
The Astryx CLI audit confirms Button/Input/Textarea/Tabs/Dialog/Menu/Checkbox/
Avatar are not honest drop-ins because their semantics or native form APIs
differ; keep those local and token-backed. Next clean candidates are the
contained filter Popover, then simple Selectors. Keep the
children/`asChild` Button surface for load-bearing navigation CTAs.

**Phase 2 — product app** (`apps/web/app/app/*`, `components/product/*`,
`components/keywords/*`, `components/mentions/*`, `components/onboarding/*`):
**started**. Persistent ProductShell, loading/error states, and dashboard entry
are now Astryx-token/Lucide-first with no editorial sidebar labels. Continue
through keywords, mentions, settings, onboarding, mobile nav, and sign-in/up. Run `transitions review` to map the best-fit motion to each surface
(modal open, dropdown, panel reveal, page side-by-side list↔detail, skeleton
loader→content, tabs sliding, number pop-in for counts, like/saved,
card hover tilt on mentions).

**Phase 3 — admin** (`apps/admin/*`): **started**. Admin is fully Lucide-first
and no longer depends on Phosphor; `globals.css` is cleaned of the stale
`--font-display` ref. Continue shell, metrics, changelog, deletions, feature
requests, and access/unauth surface composition.

**Phase 4 — marketing + content** (`(public)/blog/*`, `(public)/changelog/*`,
public layout, `site-header`, `site-footer`, `mobile-navigation`): **started**.
The persistent public frame is Astryx-token/Lucide-first and mobile nav has
transitions.dev menu/icon motion. Continue blog/changelog off editorial reading
styles; apply learn-more hover and card motion only where useful.

**Phase 5 — email surfaces** (`packages/email/*`): bring email templates to the
neutral + amber palette / spacing where renderable; keep platform-safe inline
styling.

**Cross-cutting**: finish the Lucide-first icon swap across the ~46 Phosphor
files (keep brand marks); retire raw `var(--canvas*)`/`var(--ink*)`/`--brand*`
references per migrated surface so the compatibility shim can eventually be
deleted; verify light + dark, keyboard nav, reduced-motion, and empty/error/
loading states at each boundary.

## Build a custom accent theme (optional, prod)

If the runtime accent override ever needs richer derived tokens (multi-stop
scales, component overrides), graduate from the CSS override to a built theme:
`defineTheme({ name: "astreex", extends: neutralTheme, tokens: { "--color-accent": (...) } })`
then `npx astryx theme build ./src/themes/astreex.ts` (run from `packages/ui`)
for an SSR-correct, injection-free `.css`/`.js` pair.
