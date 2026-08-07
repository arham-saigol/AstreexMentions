---
name: transitions-dev
description: Production-ready CSS transitions for web apps. Use when implementing dropdowns, modals, panel reveals, page transitions, card resizes, number pop-ins, text swaps, icon swaps, success checks, avatar group hovers, error shakes, search/input clear, skeleton loaders, shimmer text, sliding tabs, tooltips, staggered text reveals, card hover tilt, plus-to-menu morph, accordions, toasts, likes, learn-more hovers, checkboxes, spinning counters, or toggles. Commands: `transitions reveal`, `transitions review`, `transitions apply`, `transitions refine`.
---

# Transitions.dev

Portable CSS transitions, namespaced under `t-*` selectors with semantic CSS
custom properties. Drop-in: paste the snippet, wire the documented HTML hooks.
No framework dependencies; every snippet ships a `prefers-reduced-motion` guard.

Installed snippets live next to this file (`NN-name.md`). Only the two currently
in use (texts-reveal, accordion) are vendored here; copy more from
https://github.com/Jakubantalik/transitions.dev as needed.

## Quick reference (authoritative list)

| Transition               | When to use                                            | File                       |
| ------------------------ | ------------------------------------------------------ | -------------------------- |
| Card resize              | Tween a container's width/height on layout change      | 01-card-resize.md          |
| Number pop-in            | Re-enter each digit with a blurred slide on update     | 02-number-pop-in.md        |
| Notification badge       | Slide a small badge onto a trigger + pop the dot       | 03-notification-badge.md   |
| Text states swap         | Swap text in place with a blurred up/down transition   | 04-text-states-swap.md     |
| Menu dropdown            | Open an origin-aware dropdown growing from its trigger | 05-menu-dropdown.md        |
| Modal open/close         | Scale-up modal, softer scale-down on close             | 06-modal.md                |
| Panel reveal             | Slide a panel into a region with a cross-blur          | 07-panel-reveal.md         |
| Page side-by-side        | Slide between list↔detail / step1↔step2 pages          | 08-page-side-by-side.md    |
| Icon swap                | Cross-fade two icons in the same slot with blur+scale  | 09-icon-swap.md            |
| Success check            | Compose fade+rotate+Y-bob+stroke-draw for "done"       | 10-success-check.md        |
| Avatar group hover       | Distance-falloff lift + bouncy spring on a row         | 11-avatar-group-hover.md   |
| Error state shake        | Per-segment cubic-bezier shake, auto-reverting         | 12-error-state-shake.md    |
| Input clear dissolve     | Fly-out + per-word streak when a field is cleared      | 13-input-clear-dissolve.md |
| Skeleton loader + reveal | Pulse placeholder, cross-fade+blur to content          | 14-skeleton-reveal.md      |
| Shimmer text             | Sweep a highlight band across muted text on a loop     | 15-shimmer-text.md         |
| Tabs sliding             | Slide the active pill between segmented tabs           | 16-tabs-sliding.md         |
| Tooltip open/close       | Delayed fade+scale in, instant out                     | 17-tooltip.md              |
| Texts reveal             | Staggered blurred rise for stacked text lines          | 18-texts-reveal.md         |
| Card hover tilt          | 3D pointer tilt with cursor-tracked glare              | 19-card-tilt.md            |
| Plus to menu morph       | Morph a circular trigger into its menu/panel           | 20-plus-menu-morph.md      |
| Accordion expand         | grid-template-rows 0fr↔1fr + chevron flip              | 21-accordion.md            |
| Toast open/close         | Rise from below with fade + cross-blur                 | 22-toast.md                |
| Like button              | Fill a heart with pop + particle burst                 | 23-like-button.md          |
| Learn more hover         | Slide chevron + spread arms into an arrow              | 24-learn-more-hover.md     |
| Checkbox check           | Fill the box, then stroke-draw the check               | 25-checkbox-check.md       |
| Spinning counter         | Spin slot-machine digit reels with motion blur         | 26-spinning-counter.md     |
| Toggle                   | Travel the switch thumb with a double bounce           | 27-toggle.md               |

## Decision rules

Match the visible UI element first, then the verb:

- Trigger + small floating dot → notification badge.
- Trigger + surface that grows from it → dropdown (anchored) or modal (centered).
- Surface sliding into a page region → panel reveal.
- Two screens list↔detail / step1↔step2 → page side-by-side.
- Element changes width/height → card resize.
- Text content changes in place → text states swap.
- Two icons in the same slot → icon swap.
- A number updates → number pop-in.
- "done" moment (checkmark, file uploaded) → success check.
- Hovering an item in a horizontal stack → avatar group hover.
- Form validation error → error state shake.
- Clearing a text field → input clear dissolve.
- Placeholder loads then swaps to content → skeleton loader + reveal.
- "thinking" streaming text → shimmer text.
- Mutually-exclusive options with a moving highlight → tabs sliding.
- Hover/focus hint over a trigger → tooltip.
- Headline + supporting line entering with rhythm → texts reveal.
- Card reacting in 3D to the pointer → card hover tilt.
- Circular trigger becomes the surface it opens → plus to menu morph.
- Header with collapsible body → accordion expand.
- No clear match → `transitions reveal` and let the user pick. Don't guess.

Prefer the lower-overhead option when two fit (card resize over panel reveal,
dropdown over modal) unless the design clearly calls for the heavier surface.

## Commands

- `transitions reveal` — print the transitions as a numbered list (reuse the rows above; do not invent copy).
- `transitions review` — search the workspace for `transition:` / `@keyframes` / hardcoded `ms` durations / components matching the decision rules; emit a per-file list of best-fit suggestions. Do not edit. End with: "Run `transitions apply` on any line to install the suggested transition."
- `transitions apply` — read element context near the cursor (or the named transition) and install it: add the `t-*` CSS (once, shared), wire the HTML hooks, add the orchestration. Respect an existing `t-*` class.
- `transitions refine` — re-tune an installed transition's duration/easing/vars against the design.

Every installed transition keeps its `@media (prefers-reduced-motion: reduce)` guard.
