# Motion and interaction

Motion explains causality and preserves continuity. It is not decoration. The information is the destination; animation is only the trip.

## Complexity ladder

1. Use instant state and CSS transitions for color, opacity, and simple transforms.
2. Reuse a shared Astreex transition for overlays, swaps, list changes, and layout continuity.
3. Evaluate a maintained recipe from [Transitions.dev](https://transitions.dev/) when it matches the exact interaction.
4. For interruptible, layout-aware, gesture, or async behavior, evaluate the headless patterns from [Interior](https://www.interior.dev/docs) and its `motion` dependency. Copy behavior into the project and fully reskin it; do not import an example's visual language.

Inspect installed versions, types, licenses, and reduced-motion behavior before adding or copying code. A new dependency must remove more interaction risk and custom code than it adds.

## Semantic tokens

Define these once and choose by intent:

| Token             | Duration | Use                                              |
| ----------------- | -------: | ------------------------------------------------ |
| `motion-instant`  |    `0ms` | Focus, critical error visibility, reduced motion |
| `motion-feedback` |   `90ms` | Press, check, tiny state confirmation            |
| `motion-control`  |  `140ms` | Hover, selection, tooltip, compact exit          |
| `motion-overlay`  |  `200ms` | Popover, dropdown, dialog entrance               |
| `motion-layout`   |  `260ms` | Panel, row insertion, measured layout continuity |
| `motion-emphasis` |  `360ms` | Rare onboarding or milestone moment              |

Use `cubic-bezier(0.16, 1, 0.3, 1)` for entrances, `cubic-bezier(0.7, 0, 0.84, 0)` for exits, and `cubic-bezier(0.2, 0, 0, 1)` for in-place state or layout changes. Exits are approximately 70% of the paired entrance and never longer.

Distances are `4px` for controls and menus, `8px` for overlays, and `16px` for panels. Larger travel needs a spatial reason. Animate opacity and transform; use layout projection for measured resizing rather than tweening layout properties by hand.

## Interaction contracts

### Buttons and async actions

- Hover changes color or contrast in `motion-control`; press uses a subtle `scale(0.98)` or one-pixel displacement in `motion-feedback`.
- Pending feedback starts immediately. Reserve the widest reachable label or use an overlaid label swap so the button and surrounding row never jump.
- Keep the original action understandable while pending. A spinner supplements a stable label; it does not replace all meaning.
- Ignore or coalesce duplicate activation where the operation is not safe to repeat. On failure, return control and keep the error adjacent or otherwise causally connected.

### Menus, selects, and popovers

- Open from the trigger's transform origin with opacity plus `4px` translation or `0.98` scale in `motion-overlay`.
- Close in `motion-control` and return focus immediately according to the primitive's contract.
- Move focus and announce content at the start, not after animation.
- Keep selected state stable across reopen. Long menus scroll inside a bounded surface without moving the trigger.

### Dialogs and panels

- Overlay fades; content uses opacity with `0.98 → 1` scale for a centered dialog or directional `8–16px` travel for a panel that has a spatial origin.
- Preserve context under the overlay. Avoid large cinematic sweeps for routine settings.
- Make close interruptible during entrance. A rapid open-close-open sequence must continue from the current visual state rather than queueing animations.

### Lists, filters, and saved views

- Insert or remove rows with layout continuity and a short fade; nearby content should glide to its new position rather than jump.
- Keep undo available when product behavior supports it. Removal feedback must not make the next row move under the pointer before the action is understood.
- Animate filter token entry/exit only when it helps connect the popover selection to the applied query. Results may crossfade or use a stable skeleton; the entire page does not re-enter.

### Loading, numbers, and icons

- Skeleton-to-content uses a short crossfade with identical geometry.
- Spin only an indeterminate progress glyph. Stop it as soon as the request settles.
- Animate numbers only when change magnitude matters; preserve tabular width and announce the final value accessibly.
- Icon swaps use opacity plus small scale in `motion-control`. The accessible name reflects the current action, not the decorative transition.

### Toasts and notices

- Use a toast when the changed state is not otherwise visible. Enter from the edge where it lives with opacity and `8px` travel; exit faster.
- Pause dismissal for hover and keyboard focus. Critical errors remain until resolved or explicitly dismissed.
- Never use a toast as the only location for form errors, destructive consequences, or required next steps.

## Reduced motion and performance

Under `prefers-reduced-motion: reduce`, set travel, scale, blur, spring, stagger, and smooth-scroll behavior to instant. Keep necessary color changes and focus visibility. Content order, announcements, and final states remain identical.

Test interruption, rapid repeated input, slow network, error return, background-tab return, and unmount during async work. Avoid animation work that blocks the main thread, delays input, or shifts the pointer target.

The quality basis is the official guidance from [Transitions.dev](https://transitions.dev/skill.html), [Interior](https://www.interior.dev/docs), and [Atlassian's semantic motion system](https://atlassian.design/foundations/motion). Use the principles; do not copy another brand's timing blindly when Astreex's token already fits.
