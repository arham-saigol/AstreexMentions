# Astreex foundations

This file is the visual single source of truth for Astreex. Implement tokens once in the shared UI theme and consume them everywhere. Web, admin, authentication, and email may need different delivery mechanisms, but they do not get different visual decisions.

In this repository, `packages/ui` owns product tokens and shared primitives. App styles import or map those tokens; they do not repeat the values. `packages/email` maps the same named palette to email-safe inline styles, and Clerk appearance maps it through the provider's supported API.

## Brand idea: the quiet signal

Astreex watches public conversation without making the user feel watched, overwhelmed, or sold to. It surfaces the few conversations worth attention and preserves enough provenance to trust them.

The brand is:

- **Observant:** notices detail and retains context.
- **Composed:** calm under volume; never loud for its own sake.
- **Decisive:** turns listening into a clear next move.
- **Exact:** states what is known, unavailable, delayed, or inferred.

The brand is not cosmic decoration, surveillance theater, an AI oracle, or a generic growth dashboard. The mark's dot suggests a found signal; use that idea through a precise point, rail, or selected-state marker, not stars, galaxies, radar sweeps, or orbit graphics.

## Visual signature

The recognizable Astreex composition is **field notes with a signal rail**:

- warm-neutral or deep-ink planes create calm;
- one cobalt signal color marks focus, selection, and action;
- content reads like concise field reports, with provenance before interpretation;
- a 2px signal rail or point may anchor the active item, selected view, or key proof moment;
- typography and negative space carry hierarchy before containers do.

Use one signature moment per view at most. Repeating the rail on every card turns it into decoration.

## Color

All values are solid. Name tokens by meaning, not appearance. Alpha variants are allowed only as shared tokens with a tested role; do not manufacture `/5`, `/10`, or `/20` variants at call sites.

### Light theme

| Token            |     Value | Role                                               |
| ---------------- | --------: | -------------------------------------------------- |
| `canvas`         | `#F6F7F9` | App and page background                            |
| `surface`        | `#FFFFFF` | Primary working plane                              |
| `surface-subtle` | `#EEF1F5` | Selected rows, quiet controls, grouped content     |
| `surface-strong` | `#E4E8EF` | Pressed and emphasized neutral state               |
| `ink`            | `#151821` | Primary text and icons                             |
| `ink-secondary`  | `#4B5362` | Supporting text                                    |
| `ink-tertiary`   | `#6B7380` | Metadata; minimum body contrast on white is 4.78:1 |
| `line`           | `#DDE1E8` | Structural boundary used sparingly                 |
| `line-strong`    | `#C8CED8` | Control boundary and emphasized separation         |
| `brand`          | `#3157F6` | Primary action, selected signal, logo mark         |
| `brand-hover`    | `#2747D8` | Primary hover                                      |
| `brand-pressed`  | `#2038AE` | Primary press                                      |
| `brand-soft`     | `#EDF0FF` | Selected or informational background               |
| `brand-soft-ink` | `#2441BA` | Text on brand-soft                                 |
| `focus`          | `#5474FF` | Focus ring                                         |

White on `brand` is 5.49:1. `ink` on `canvas` is 16.54:1. Do not lower these pairings with opacity.

### Dark theme

| Token            |     Value | Role                                 |
| ---------------- | --------: | ------------------------------------ |
| `canvas`         | `#0D1016` | App and page background              |
| `surface`        | `#141821` | Primary working plane                |
| `surface-subtle` | `#1B202B` | Selected rows and grouped content    |
| `surface-strong` | `#232A37` | Pressed and emphasized neutral state |
| `ink`            | `#F5F7FA` | Primary text and icons               |
| `ink-secondary`  | `#B3BAC6` | Supporting text                      |
| `ink-tertiary`   | `#8A93A3` | Metadata                             |
| `line`           | `#29313E` | Structural boundary                  |
| `line-strong`    | `#3A4453` | Control boundary                     |
| `brand`          | `#7288FF` | Primary action and selected signal   |
| `brand-hover`    | `#8296FF` | Primary hover                        |
| `brand-pressed`  | `#5F78F5` | Primary press                        |
| `brand-soft`     | `#20294E` | Selected or informational background |
| `brand-soft-ink` | `#B8C3FF` | Text on brand-soft                   |
| `focus`          | `#8CA0FF` | Focus ring                           |

Use dark `canvas` ink on the dark-theme `brand` button. That pairing is 6.06:1.

### Status and category color

Color is functional. Status colors communicate state; category colors help scan AI organization. Neither is decoration, and neither replaces a text label or icon when the meaning could be ambiguous.

Light foreground/background pairs:

| Meaning          | Foreground | Background |
| ---------------- | ---------: | ---------: |
| Question / info  |  `#2441BA` |  `#EDF0FF` |
| Complaint        |  `#A34411` |  `#FFF0E6` |
| Praise / success |  `#18794E` |  `#EAF8F1` |
| Bug / danger     |  `#B42318` |  `#FEECEB` |
| Feature request  |  `#6941C6` |  `#F2ECFF` |
| Competitor       |  `#8A5A00` |  `#FFF4D6` |
| Other / neutral  |  `#536072` |  `#EEF1F5` |

Dark foreground/background pairs:

| Meaning          | Foreground | Background |
| ---------------- | ---------: | ---------: |
| Question / info  |  `#A9B8FF` |  `#1D274A` |
| Complaint        |  `#FFB184` |  `#45271A` |
| Praise / success |  `#76D3A7` |  `#153A2B` |
| Bug / danger     |  `#FF9C94` |  `#481F1D` |
| Feature request  |  `#C6AEFF` |  `#322453` |
| Competitor       |  `#F0C36A` |  `#443516` |
| Other / neutral  |  `#B6BFCD` |  `#252C37` |

Every listed foreground/background pair exceeds 4.9:1. Validate any new pair in both themes before adding it.

## Typography

Use type as the primary hierarchy system.

- **Product and body:** `Inter`, then the existing system sans fallback. The current repository already uses it; quality comes from disciplined scale and composition, not a novelty font.
- **Marketing display:** `Inter Tight`, self-hosted through the framework, with `Inter` as fallback. Use it only for large brand headlines and numeric proof, never controls or dense data.
- **Monospace:** `SFMono-Regular`, `Consolas`, `Liberation Mono`, monospace for identifiers, code, and fixed-width data—not decorative labels.

Product type scale:

| Role          | Size / line | Weight | Notes                                |
| ------------- | ----------: | -----: | ------------------------------------ |
| Page title    |     `28/34` |    600 | One per view                         |
| Section title |     `20/26` |    600 | Avoid when spacing can group content |
| Row title     |     `15/21` |    600 | Mention or keyword primary text      |
| Body          |     `14/21` |    400 | Default product copy                 |
| Label         |     `13/18` |    550 | Controls and compact navigation      |
| Metadata      |     `12/17` |    450 | Provenance, time, counts             |

Marketing display uses a fluid `44–72px` range with `0.94–1.02` line height and a maximum measure of 12–15 words per line. Body copy tops out at `18/29` and 62 characters per line. Use sentence case. Uppercase is limited to short data stamps of four words or fewer; letter spacing never substitutes for hierarchy.

## Spacing and layout

Use a 4px base with the scale `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 120`.

- Product content max: `1200px`; dense review views may reach `1280px` when the extra width improves scanning.
- Marketing content max: `1184px`; reading measure is independently capped.
- Page gutters: `16px` narrow, `24px` tablet, `32px` desktop.
- Default product section gap: `32px`; related control gap: `8px`; row block gap: `12–16px`.
- Controls: `32px` compact, `40px` default, `48px` prominent or touch-first.
- Maintain at least a `24×24px` pointer target and prefer `40×40px` for standalone product controls and `44×44px` on touch layouts.

Widths follow content and task. A primary form control fills its form column; a filter trigger fits its label; a modal is only as wide as the decision it contains. Test the longest realistic label before fixing a width.

## Shape, borders, and elevation

- Radius: `4px` for tiny indicators, `6px` for controls and rows, `10px` for popovers and compact overlays, `14px` for major feature surfaces. Full pills only for compact semantic tokens.
- Use one outer boundary around a genuine interactive or scroll region. Inside, prefer alignment and spacing; use a divider only when neighboring content would otherwise be misread as one unit.
- Inputs may use `line-strong`; passive content should rarely look like an input.
- Shadows are reserved for temporary layers. Use a crisp ambient shadow, never a glowing halo: `0 12px 32px rgb(17 24 39 / 0.14), 0 2px 8px rgb(17 24 39 / 0.08)` in light and `0 16px 40px rgb(0 0 0 / 0.42)` in dark.
- Avoid pairing a border, tinted background, and shadow on the same static region. Pick the minimum cue that makes containment legible.

## Logo, icons, and imagery

The existing Astreex A-and-point mark is the canonical mark until a dedicated identity project replaces it. Preserve its geometry, clear space of at least half the mark width, and solid `brand` or monochrome rendering. Do not place it in a rounded tile, recolor its dot separately, add effects, or use it as a decorative pattern.

Use Phosphor as the canonical icon family at regular weight. Standard sizes are `16px` in controls, `18px` in navigation, and `20px` for standalone actions. Match optical weight and baseline; a mathematically centered icon can still require a one-pixel optical correction.

Product imagery should show credible Astreex content and context. Marketing art may abstract source points into a sparse editorial composition, but it remains flat, solid-color, and information-led. Avoid stock 3D shapes, glass effects, generic device mockups, decorative grids, and invented customer proof.
