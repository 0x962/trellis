# Updates column width

`AgentStatusUpdates` reads one browser preference from `useStatusPaneWidth`.
The loading shell, error shell, and populated pane receive that preference.
Session changes and observer toggles retain it.
Browser storage holds the selected width under `trellis-session-updates-width`.
If the browser refuses storage, the current page retains the width in memory.

`SessionStatusPaneShell` owns measurement and the active drag.
Its `ResizeObserver` reads the direct parent width.
The initial width is 374 px.
The desktop bounds reserve 280 px for Updates and 320 px for the transcript.
When those minimum widths do not fit, the columns share the available space.
A smaller parent clamps the displayed width and retains the saved preference.
The full saved width returns when space permits it.
Below the existing `md` breakpoint, the pane uses the full stacked width and hides the handle.

The shared `ResizeHandle` uses the Sheet handle styles and `hitArea.handle4`.
The strip is 4 px wide.
Its hit area is 28 px for a pointer and 44 px for a coarse pointer.
Arrow Left increases the right column width by 16 px.
Arrow Right decreases it by 16 px.
Shift changes the step to 64 px.
Home selects the minimum width, and End selects the maximum width.
The separator exposes its name, orientation, controlled pane, current width, and current bounds.

Pointer release saves the selected width.
Escape, pointer cancellation, capture loss, window blur, unmount, and a switch to the narrow layout cancel the drag.
Cancellation restores the saved preference.
The timeline retains its component identity throughout the drag.

## Verification status

TRL-1238 defers execution until the release owner selects the next batch.
The mounted cases are authored and unexecuted.
Tests, type checks, lint, browser checks, Review, merge, and deployment remain pending.

The mounted fixture uses the actual query integration, shell, timeline, and preference store.
It supplies synthetic query replies, parent sizes, media queries, and pointer capture.
It checks query states, observer errors, session changes, observer toggles, storage, keyboard controls, drag completion, and cancellation.
It also checks timeline selection, DOM identity, viewport identity, and the retained scroll value.
These fixtures do not establish rendered geometry or native pointer capture.

Run each command from the repository root after the release owner selects this source:

```sh
bun test apps/web/src/features/sessions/SessionConversation/components/AgentStatusUpdates/AgentStatusUpdates.resize.test.tsx
bun test apps/web/src/features/sessions/SessionConversation/components/AgentStatusUpdates/AgentStatusUpdates.test.tsx apps/web/src/features/sessions/SessionConversation/components/AgentStatusUpdates/agentStatusUpdatesState.test.ts packages/ui/src/domain/SessionStatusPane/SessionStatusPane.test.tsx
bun run --filter @trellis/ui typecheck
bun run --filter @trellis/web typecheck
```

Run the mounted file in its own process because it installs a DOM fixture.
Run the repository Biome check on the changed TypeScript files.
The release owner retains the combined checks and required Review.

## Browser proof plan

Use the actual session view in the selected batch.
Use a fixture session with synthetic history, rich content, and enough updates to scroll.
Keep the same transcript, selected update, and observer controls visible throughout each case.
Record the viewport size, theme, parent width, selected width, and observed result with each capture.

1. Open the session at desktop width in both themes. Confirm the 374 px default with a fresh preference. Compare the handle strip, hit area, hover, active, and focus states with the Sheet handle. Confirm the separator name, orientation, current value, bounds, and controlled pane in the accessibility tree.
2. Select an older update and scroll partway through it. Drag the left boundary in both directions. Move outside the handle, across a rich embed, and outside the pane. Release it. Confirm continuous movement, retained selection, a stable visible scroll anchor, and a usable transcript. Confirm that the timeline does not remount.
3. Cancel separate drags with Escape, pointer cancellation, capture loss, window blur, and an observer toggle. Confirm that each case releases capture and restores the saved width. Confirm that later pointer movement does not resize the pane.
4. Tab to the separator. Check both arrows, Shift with each arrow, Home, and End. Confirm focus visibility and screen reader values. Confirm that the timeline still receives its own keyboard controls when it has focus.
5. Save a width, change sessions, toggle the observer off and on, and reload the app. Exercise loading, initial error, empty history, populated history, observer error, and history pagination. Confirm the same selected width wherever the parent permits it.
6. Change the available parent width through the sidebar and window controls. Confirm new bounds without a window resize when only the sidebar changes. Confirm that both columns fit without horizontal overflow. Restore the parent width and confirm that the saved width returns.
7. Check 320 px, 390 px, 767 px, and 768 px viewports, plus a narrow conversation inside a desktop viewport. Confirm full width, bounded height, and stacked order below `md`. Confirm that the separator leaves the tab order there. Return to desktop width and confirm the saved width.
8. Check a coarse pointer at desktop width, reduced motion, and browser zoom. Confirm the 44 px hit area, stable content, and correct breakpoint behavior. Record any browser or installed-app gaps separately.
