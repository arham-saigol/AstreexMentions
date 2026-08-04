---
name: astreex-design
description: Signal-first Astreex design system. Use when changing product UI or interactions, building marketing or brand surfaces, writing user-facing copy, creating customer emails, or reviewing visual and UX quality.
---

# Astreex design

Astreex is a listening desk for customer conversations, not an analytics dashboard. Its interface should turn a noisy stream into a calm next action while preserving the source context that makes each mention credible.

The leading word is **signal**. Every element must improve signal, orientation, or action. If it does none of those, remove it.

## Load the right reference

Before changing a visible surface, read [`foundations.md`](foundations.md) completely. Then read every branch that applies:

- Product app, onboarding, settings, admin, or shared components: [`product-ui.md`](product-ui.md)
- Marketing pages, authentication, emails, brand expression, or any user-facing words: [`brand-and-voice.md`](brand-and-voice.md)
- Any action feedback, state change, overlay, loading treatment, transition, or animation: [`motion.md`](motion.md)

Before declaring the work complete, read and execute [`review.md`](review.md) completely. These pointers are completion requirements, not optional inspiration.

## Guardrails

- Compose with solid color, typography, spacing, and contrast. Gradients are outside the Astreex language.
- Use semantic tokens from the canonical shared theme. Raw colors and slightly altered local accents are defects, not harmless exceptions.
- Treat Radix, Shadcn, and similar components as behavior scaffolding. A visible primitive is finished only after its geometry, states, motion, and content have been designed for Astreex.
- Ship branded, accessible controls for selects, menus, date pickers, dialogs, and tooltips. A browser-native control is acceptable only when the platform-native experience is the explicit product decision; it is never a shortcut.
- Give each hierarchy level one main containment cue: spacing, surface color, border, or elevation. Nested boxes, divider stacks, and boxed icons weaken the signal.
- Reserve pills for statuses, categories, filters, and compact values. Controls and decorative labels use the system geometry for their role.
- Make copy earn its space. A heading stands alone when it is self-explanatory; helper text exists only when it prevents a mistake, resolves genuine ambiguity, or communicates consequential state.
- Build from the user's task and Astreex's content. Generic bento grids, interchangeable SaaS heroes, feature-card trios, and decorative dashboard charts are not composition plans.
- Preserve accessibility, semantics, and trust while simplifying. Visual restraint never removes labels, focus, error recovery, authorization truth, or essential context.
- A surface is unfinished while any reachable state, supported viewport, theme, input method, or reduced-motion mode has an unaccounted visible defect.

## 1. Observe the real surface

Trace the actual user flow, render the current surface, and inspect the nearest shared tokens and primitives before choosing a composition. Inventory:

- the user's job and the decision the surface should make easier;
- content shapes, realistic long values, and empty values;
- loading, empty, error, disabled, pending, success, selected, expanded, and destructive states that can be reached;
- supported themes, viewports, keyboard behavior, focus movement, and async boundaries;
- existing components worth reusing and visual debt that must not be copied forward.

For a visual change, capture the current desktop and narrow-screen state. For a new surface, inspect the nearest real product flow instead.

**Complete when:** every affected state and boundary is named, the shared implementation seam is known, and there is visual evidence of the starting point.

## 2. Establish the signal hierarchy

Write a compact design contract before coding:

1. the one-sentence job;
2. the single focal point;
3. the reading or action order;
4. what will be removed or quieted;
5. the tokens and primitives that will carry the design;
6. one Astreex signature moment, if the surface merits one.

For a new page or substantial redesign, consider at least three materially different composition hypotheses. Compare information order, scan path, density, responsive behavior, and distinctiveness; color variations do not count as different compositions. Choose the simplest hypothesis that makes the user's next decision obvious.

Use Linear, Notion, Attio, and Apple as a quality bar for judgment—not as templates or a source of motifs. The result should be recognizable as Astreex with the logos removed.

**Complete when:** the chosen composition has one clear hierarchy, a reason for every region, and no unresolved “we will style it later” areas.

## 3. Build from the system outward

Implement the narrowest shared root fix. Reuse the existing accessible primitive when its behavior fits, then replace its stock visual decisions with Astreex tokens and geometry. Promote a decision to a shared token or component only when the current work demonstrates repeated use.

Keep content and controls honest:

- use realistic product data and the domain terms defined in the references;
- reserve dimensions for content changes that would otherwise jump;
- prefer progressive disclosure over permanent instructions;
- preserve original mention context and backend truth;
- make the primary action visually singular;
- use icons to identify or accelerate, never to decorate empty space.

Do not hide incomplete styling behind a local override. If a shared primitive is the source of the defect, finish the primitive and verify its other callers.

**Complete when:** every visual value comes from the system or a documented new token, every reachable state is intentionally composed, and no unintended stock or native-looking control remains in the affected flow.

## 4. Finish the half-second

For every action, specify what happens on hover, focus, press, pending, success, failure, interruption, and repeated activation. Feedback begins with the action, not after the network returns. Space is reserved before labels, counts, rows, or errors change.

Use [`motion.md`](motion.md) by semantic role. Simple state feedback uses CSS and shared tokens. Reach for an established motion recipe or library only when it materially improves interruption, layout continuity, gesture physics, or orchestration.

**Complete when:** each action visibly lands, async work is bounded and recoverable, no state change causes accidental layout shift, and the same information arrives with motion disabled.

## 5. Run the three-pass critique

Render the implementation and complete three separate passes; do not collapse them into one glance:

1. **Composition:** squint at the page. Check focal point, scan path, density, line length, negative space, and whether removing anything improves it.
2. **System:** inspect alignment, exact tokens, typography, icon weight, control geometry, containment, states, and consistency with adjacent surfaces.
3. **Behavior:** operate the full flow with pointer and keyboard across required viewports, themes, async outcomes, long content, and reduced motion.

Fix the problems found after each pass and re-render before starting the next. A critique that produces no observations must explicitly account for every item in that pass.

**Complete when:** all checks in [`review.md`](review.md) pass, there are no unexplained overflows or visual defects, and before/after evidence demonstrates a stronger signal hierarchy.

## 6. Verify the implementation

Run the narrowest relevant tests and static checks, then verify every shared component boundary touched by the change. Report the surfaces, states, viewports, and themes actually inspected; do not imply coverage that was not performed.

**Complete when:** the affected packages pass their checks, the browser flow has no new console errors, the final rendered evidence is reviewed rather than merely captured, and any genuine verification limit is stated.
