# Visual and UX completion review

Run this after implementation and after reading the branch references. Record what was actually checked. A screenshot is evidence only after it has been inspected against these gates.

## 1. Composition gate

- At first glance, can a new user identify the page's purpose, focal point, and primary action?
- Does the eye move in the intended order without competing headings, badges, banners, or CTAs?
- Can any subtitle, helper, eyebrow, icon tile, divider, border, or card disappear without loss? Remove it.
- Are related items closer to each other than to unrelated items?
- Do line length, control width, and container width fit the real content rather than a template default?
- Is negative space doing useful grouping, or merely making the page feel empty?
- Does the surface have one Astreex signal signature at most, and would it still read as Astreex without the logo?

## 2. System gate

- Search the changed files for raw colors, arbitrary radii, one-off shadows, hardcoded durations, and ad hoc spacing. Each result must be a canonical token definition or be removed.
- Verify exact light and dark token use. Opacity must not push text or controls below contrast requirements.
- Compare repeated components side by side: height, padding, radius, label weight, icon size, focus, disabled, pending, and destructive states must match.
- Confirm every dropdown, select, date control, dialog, tooltip, and menu is fully branded and retains accessible primitive behavior.
- Check for stock Shadcn appearance: generic `rounded-md border shadow-sm` composition, default animation utilities, and nested muted cards. Recompose rather than cosmetically recolor.
- Inspect icon optical size and baseline. Remove containers whose only purpose is to put a border behind an icon.
- Check logo clear space, single-color rendering, and wordmark consistency.
- Search for gradients. Any gradient is a failing result.

## 3. Content gate

- Every visible sentence serves orientation, decision, proof, consequence, recovery, or accessibility.
- Headings do not repeat navigation or nearby labels. Helper text does not narrate implementation details.
- Domain terms match the voice reference. The interface does not call mentions “signals” as a stored object.
- Copy names real limits and failure scopes. It does not overpromise provider coverage, speed, AI certainty, or billing behavior.
- Long and empty values remain understandable. Truncation has a recovery path.
- Illustrative marketing data is labeled once, quietly. Customer evidence is real and attributable.

## 4. State and interaction gate

Operate each affected action through hover, focus, press, pending, success, error, disabled, repeated activation, and interruption where applicable.

- Feedback begins immediately and remains causally near the action.
- Changing labels, counts, errors, rows, and skeletons do not produce accidental layout shift.
- Overlays originate from the right place, focus correctly, close by keyboard, and can reverse mid-transition.
- Destructive actions state the object, consequence, and recovery model.
- Empty, unavailable, billing, quota, authorization, configuration, and provider-error states remain distinct.
- Motion uses semantic tokens and adds understanding. Reduced motion reaches the same state instantly.
- The browser console has no new errors, hydration warnings, missing keys, or accessibility warnings.

## 5. Responsive gate

Inspect at least these viewports for page-level work:

- `390×844` phone;
- `768×1024` tablet or narrow laptop;
- `1440×900` desktop.

For a shared primitive, also inspect it in its narrowest and densest real callers.

- No horizontal page overflow, clipped focus ring, accidental text collision, or unreachable action.
- Responsive order follows task priority rather than desktop DOM order.
- Touch targets are at least 44px for primary mobile controls; dense exceptions still meet WCAG 2.2's 24px minimum and spacing rule.
- Menus and dialogs stay inside the visual viewport and remain operable with the on-screen keyboard.
- Test the longest realistic label and a 200% zoom or equivalent narrow reflow.

## 6. Theme and accessibility gate

- Inspect every supported theme; changing theme does not reveal raw colors, wrong logos, invisible borders, or low-contrast states.
- Navigate the full changed flow by keyboard. Focus order follows visual order and no focus indicator is clipped or replaced with color alone.
- Screen-reader names distinguish repeated icon actions. Status is not communicated by color alone.
- Form labels, descriptions, errors, and required state are programmatically connected.
- Content remains understandable with images blocked and motion disabled.
- Use the current [WCAG 2.2 target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) and test contrast with a real checker when new colors are introduced.

## 7. Finish gate

- Revisit the before evidence. The change has a clearer hierarchy, fewer unnecessary elements, and no lost capability.
- Inspect the final screenshots at full size; do not accept “looks fine” from a thumbnail.
- Run the affected package's tests, lint, typecheck, and build in proportion to the change. Shared-token or primitive changes require verification of every consuming app in scope.
- Account for all user-visible defects found during the three critique passes. Fix them or state the concrete blocker; do not leave silent polish debt.
- Report the exact routes, states, viewports, themes, input methods, and checks verified.

The work is complete only when every applicable item above is accounted for and the rendered surface has no known visible defect in scope.
