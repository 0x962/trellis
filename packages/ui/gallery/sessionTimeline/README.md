# Session timeline fixture

Run `bun run --cwd packages/ui gallery` after the source batch merges.
Open `http://127.0.0.1:5180/session-timeline.html` with Aside.
Press **Run mounted checks** to exercise the mounted production component.
The output lists each passed assertion. A failed assertion throws its name.

The checks cover selection, keyboard focus, day folds, ARIA ownership, new arrivals, scroll retention, dot targets, width, and the isolated embed.
The additional history checks load 1,000 updates, jump to the last row, preserve distant selection on arrival, and retry an empty failed read.
Use **Add update** during a manual check of long content. Select **empty**, **paused**, **failed**, or **history-error** to inspect those states.
Repeat at 320 pixels and in both themes. Use the actual viewport width for the narrow check.
The fixture uses synthetic updates and a small Markdown renderer. The app supplies its existing Markdown renderer.
The fixture does not call a provider or prove installed behavior.

Run focused source tests from the repository root:

```sh
bun test packages/ui/src/domain/SessionStatusPane packages/api/src/schemas/sessionUpdates apps/web/src/features/sessions/SessionConversation/components/AgentStatusUpdates
bun test apps/server/src/services/sessionUpdates/sessionUpdates.test.ts
```

Run the UI, web, API, and server type checks and changed-file Biome after merge.
Stop the fixture server after the browser check.
