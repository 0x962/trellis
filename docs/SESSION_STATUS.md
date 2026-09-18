# Session status and alerts

Trellis derives session status from provider events and the runtime process record.
Terminal output alone does not establish that an agent needs input or has completed a turn.

## Superset reference

The reference checkout is `superset` at commit `1019540c0`.
Its desktop app maps lifecycle events to terminal status and notifications.

- `apps/desktop/src/renderer/hooks/host-service/useTerminalAgentStatuses/deriveTerminalAgentStatus.ts` derives status.
- `apps/desktop/src/renderer/routes/_authenticated/components/V2NotificationController/lib/lifecycleEvents.ts` handles lifecycle alerts.
- `packages/host-service/src/events/map-event-type.ts` maps completion, interruption, input, and failure events.
- `apps/desktop/src/main/lib/notification-sound.ts` reads mute and volume settings. The default volume is 100%.

Trellis uses its existing provider bridges, runtime journal, host event stream, and shared UI components.

## Status rules

| Status | Source | Clears when |
| --- | --- | --- |
| Starting | A process launch is in progress | The runtime observes the process |
| Working | A provider turn is active | The turn ends or needs input |
| Needs input | An unresolved provider question, permission request, or elicitation | The provider resolves the request or ends the turn |
| Done | A completed turn has an unseen completion sequence | A person views the session with focus, or another turn starts |
| Idle | A live provider has no active turn or unseen completion | A new turn starts |
| Failed | A provider failure or unsuccessful process exit | Another turn or attempt starts |
| Interrupted | The provider cancels the turn | Another turn starts |
| Stopped | The process exits | Another attempt starts |
| Unavailable | The runtime cannot confirm the process or control it | Observation resumes |

A view acknowledges completion only. It does not resolve a question.
Acknowledgements identify both the process attempt and its completion sequence.
An acknowledgement for an earlier attempt cannot clear a later attempt.

## Provider integration

| Provider | Input source | Answer surface |
| --- | --- | --- |
| Claude | `AskUserQuestion`, `PermissionRequest`, `Elicitation`, `ElicitationResult`, and tool completion hooks | Native terminal |
| Codex | App-server status flags, nonblocking `item/tool/requestUserInput`, and `serverRequest/resolved` | Native terminal |
| Muse | `userInput/request`, `userInput/requested`, and `userInput/settled` | Trellis question sheet |

Claude subagent hooks do not change the parent session status.
Claude's permission hook for `AskUserQuestion` refers to the question already reported by its tool hook.
Codex's bridge observes requests without answering them on behalf of its terminal client.
Muse accepts option selections, text answers, and explicit decline through its private control socket.
A Muse answer identifies the attempt and request. The bridge rejects a duplicate or stale answer.

## Event flow

1. Map provider events to `HarnessEvent` values.
2. Record the events in the runtime journal and derive `HarnessAttention`.
3. Observe session, ticket, and flow terminals through `startSessionMonitor`.
4. Publish `agent-runs.status` when status or attention changes.
5. Derive the same display state in the sidebar, project session list, and conversation header.
6. Deliver eligible alerts through the desktop process or the elected browser tab.

The runtime journal preserves pending requests and completion sequences across host restarts.
The database preserves the last acknowledged completion.
The runtime protocol version is 11.

## Alert behavior

Questions, completed or interrupted turns, and provider failures can produce an alert.
Process attachment, process exit, prompts, and intermediate output stay silent.
Initial snapshots seed alert history without sound or notifications.
The alert history rejects duplicate and older sequences within each attempt.
The visible terminal suppresses alerts while its window has focus.
Each new eligible event can play a sound, including completions less than one second apart.
A completion acknowledgement changes the status indicator; it does not cancel an incoming alert.

The desktop process owns its event connection and continues after the last window closes.
A notification click opens the associated session or ticket terminal.
A full application quit stops desktop alerts.
The browser elects one tab through the existing event-stream lock.
Browser notifications require permission. Browser audio remains subject to the browser's playback policy.

Settings contain the native notification switch, sound switch, and volume.
The default volume is 100%. The preview uses the same sound as a session alert.
The sound is a generated WAV tone with no external asset dependency.

## Verification and release

Focused tests cover journal replay, stale turns, overlapping requests, provider event mappings, acknowledgement races, alert deduplication, and subscription cleanup.
A live check covers questions and completion in all three installed providers.
A browser check covers the Muse answer sheet, status persistence, sound controls, and saved volume.
The Codex ticket check sends three `status?` prompts through the real provider bridge and desktop event listener.
The background replies each play one sound. The reply with a visible terminal plays none.
A browser check opens the ticket terminal from its notification path and clears terminal visibility on the Activity tab.

The host restart check preserves all three attempts, their conversations, attention, and acknowledgement values.
The unpackaged Electron check receives a live completion alert without a window.
macOS rejects its banner with `UNErrorDomain error 1`; banner display remains unverified in the installed desktop app.

A production release follows the desktop installation guide.
The release must include the database migration, provider bundles, runtime bundle, web assets, and desktop bundle.
The production installer controls runtime compatibility and conversation preservation.
