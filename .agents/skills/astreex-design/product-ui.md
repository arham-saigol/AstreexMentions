# Product UI

The product loop is **scan → understand → act → return**. Optimize the repeated review of real mentions before secondary configuration or account detail.

## Product hierarchy

1. **Mention and provenance:** what was said, where, by whom, and when.
2. **Interpretation:** category, matched keyword, and relevance clues.
3. **Action:** open the original, save, dismiss, filter, or change status.
4. **System state:** collection health, quota, connection, and billing only when it changes what the user can do.

AI categorization is an aid, not authority. Preserve the original excerpt and source link; never present a category as more certain than the backend contract supports.

## Shell and navigation

- Keep the shell stable and quiet. The working plane carries more contrast than navigation.
- Show only top-level destinations that users repeatedly visit. Put settings, billing, appearance, feedback, and sign-out in the account menu unless the information architecture proves otherwise.
- Use one active indicator: text emphasis plus the signal rail or point. Avoid a tab underline, background fill, icon color, and bold label all at once.
- Banners are for current, consequential, actionable states. Place passive environment or billing detail inside the relevant setting or state view.
- A page header contains the page title, optional compact status, and at most one primary action. Do not add an `Astreex` eyebrow above an already oriented app page.

## Mentions

The mentions view is an editorial inbox, not a card gallery.

- Use one continuous review region with rows or lightly separated articles. Avoid a fully bordered card for every mention inside another bordered feed.
- Default row order: source identity and time; excerpt or title; category and matched keyword; engagement metadata; actions.
- Keep provenance visible before interpretation. Platform icons are bare at the text baseline unless a background is necessary for recognition.
- Let the excerpt own the width. Metadata and actions must not squeeze readable content into a narrow center column.
- Truncate only when the full text is recoverable in place or through a clear detail action. Do not truncate the information needed to decide whether to open the source.
- Use one category badge. Status such as saved or dismissed should be a separate state treatment only when it matters to the current view.
- On pointer layouts, secondary actions can appear on row hover and focus-within; keyboard focus and touch layouts expose the same actions without hover dependency.
- Opening the source is the natural primary row action. Save and dismiss are immediate, reversible where the backend permits, and provide feedback without shifting the row.

## Filters and saved views

- Keep search, high-frequency filters, and the saved-view switcher close to the feed. Treat them as one query-building system.
- Show applied values, not permanent filter explanations. A compact count on the trigger and removable active tokens make state legible.
- Use branded popovers, selects, command lists, checkboxes, and date controls. Menus open from their trigger and retain the trigger's width when that improves scan alignment.
- Saved views should feel like named query states, not a second navigation bar. Make create, rename, and delete discoverable without surrounding each view in controls.
- Preserve URL or backend state where sharing and return behavior require it. Visual simplification must not make filters feel ephemeral when they are durable.

## Keywords and monitoring health

- Present keywords as compact operational rows: phrase, sources, collection state, next useful timing, and one overflow action.
- Put provider-by-provider schedules and verbose errors behind row expansion or a details panel. Lead with the summary that changes what the user should do.
- Replace backend narration with user consequences. For example, “Reddit needs attention” is useful; “Source times come from the authenticated Convex result” is implementation leakage.
- Use relative time in the scan view and exact time in a tooltip or detail view when both are useful.
- Put add/edit in one focused dialog or panel. Source selection is a branded multi-select with full keyboard behavior, not a row of decorative cards.

## Onboarding

- One decision per step. Show progress because it sets expectation, not as decoration.
- Let users understand the monitoring result before asking for payment. Preserve configuration across navigation and recoverable failures.
- Use actual controls for keywords, sources, categories, digest timing, and plan selection. Avoid preview cards that merely repeat the current form values.
- Explain only irreversible, billable, permissioned, or surprising consequences. Remove commentary about obvious controls.
- Final review is a concise editable summary. Each item links back to its step without discarding later work.

## Settings and dialogs

- Settings are an aligned document with sections, not a dashboard of cards. Use whitespace for grouping and a single divider only between genuinely different consequence levels.
- Labels identify the decision; current values and controls carry most supporting context. Put short helper text after the control only when it changes a choice.
- Save near the changed scope. Communicate saving, saved, and failed states without resizing the action row.
- Keep destructive actions at the end of their relevant section with exact consequence copy. Confirmation names the object and the recovery model.
- Dialogs are for focused decisions. Use a side panel when the user needs to compare the edited object with the underlying page; use an inline expansion for quick, low-risk detail.

## States

- **Loading:** keep the shell and page geometry stable. Skeletons mirror the final content structure and disappear with a short crossfade.
- **Empty:** state what is absent, why it matters, and the one action that resolves it. Use no decorative icon tile by default.
- **Error:** identify the failed scope, preserve successful content, and provide a bounded retry or next step. Never replace the whole page for a row-level failure.
- **Pending:** start feedback immediately, prevent duplicate submission where necessary, and keep the control's dimensions fixed.
- **Success:** prefer the changed state itself as confirmation. Use a toast only when the result is off-screen, delayed, or otherwise invisible.
- **Unavailable:** distinguish missing configuration, authorization, billing, quota, and provider failure. They require different actions and language.

## Responsive behavior

Responsive design preserves priority; it does not merely stack desktop boxes.

- At narrow widths, keep mention text and the source action primary. Collapse lower-value metadata and move complex filters to a sheet or full-width popover.
- Reorder by task, not DOM convenience. A primary action stays near the title or thumb reach rather than falling below explanatory copy.
- Horizontal control groups may scroll only when they are a familiar, ordered set and the overflow is signaled. Otherwise wrap or change the control.
- Tables become priority-preserving rows with labels; they do not become horizontally clipped mini-tables.
- Test realistic long keywords, category names, user names, prices, time zones, error messages, and translated-length labels even if localization is not yet shipped.

## Accessibility and input

- Meet WCAG 2.2 AA for contrast, semantics, keyboard access, focus order, errors, and target size. The 24px target is a floor; the foundation sizes are the product default.
- Focus rings use the shared `focus` token, remain visible in both themes, and are not clipped by overflow containers.
- Icon-only controls have accessible names and a tooltip when the action is not universally obvious.
- Menus, selects, dialogs, switches, and tabs retain the established primitive's keyboard and focus behavior after styling.
- Dense views remain readable at 200% zoom without losing actions or forcing two-dimensional scrolling.
