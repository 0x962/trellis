# Deferred verification matrix

All results are pending. Navid requires these checks after the complete Langflow merge.

The matrix consumes the accepted UI-F6 journey and the full editor source from TRL-672.
It does not repeat the schematic acceptance or replace the engine with fabricated results.

| Case | Later action | Required observation and evidence | Result |
| --- | --- | --- | --- |
| Graph contract | Generate both density cases and parse the actual graph schema. | Exact counts; unique IDs; outer ID equals inner ID; component definitions match the pinned manifest. | Pending |
| Ports | Decode each handle and compare it with its source or target node. Load the actual editor. | Every endpoint exists; native ports accept the edges; no edge disappears during hydration. | Pending |
| Snapshot | Parse the generated execution view and its progress update. | The immutable graph, revision, manifest identity, and publication agree; each document hash matches its graph. | Pending |
| Occurrence identity | Inspect both loop levels in every round. | Each parent key resolves; the full iteration path remains; the same node has distinct occurrence keys in different rounds. | Pending |
| Desktop | Load each graph at 1440 by 900 in both themes. | The actual editor renders the graph, toolbar, and inspector; selected identity stays visible. Retain screenshots and network evidence. | Pending |
| Narrow width | Load each graph at a real 320-pixel viewport in both themes. | No document overflow; reachable controls; readable identity; usable inspector and Close control. Retain measured bounds. | Pending |
| Browser zoom | Repeat the desktop and narrow journeys at actual 200% browser zoom. | Text, focus, controls, and scroll remain usable. A CSS scale or viewport resize alone is insufficient. | Pending |
| Search | Search for Release Decision and press Enter on the match. | The outline expands its ancestors; selection changes; the graph does not pan until explicit reveal. | Pending |
| Reveal | Activate Show selected step in graph. | The actual graph reveals the selected node; the inspector retains its name and ID. | Pending |
| Nested groups | Expand Release, Review rounds, Review steps, and Review branches. | Expansion follows the same parent identities as the fixture and remains stable after another selection. | Pending |
| Keyboard connection | Use the actual pinned editor to connect compatible ports. | The edge uses the selected source and target; focus returns to the originating control; no pointer is required. | Pending |
| Long instruction | Edit and save the generated long agent instruction. Reload it. | The complete text persists and remains accessible. No truncation, arbitrary ceiling, or hidden suffix appears. | Pending |
| Progress | Select the round-37 human wait, scroll the outline, and apply a real progress event. | Focus, selection, expansion, and scroll remain. The unrelated round-36 result updates without moving the person. | Pending |
| Later rounds | Move from round 36 to round 37 and then the final round. | Completed, waiting, and pending occurrences retain their distinct identities and full paths. All rounds remain accessible. | Pending |
| Skipped branch | Open the backend branch in round 37. | It says Skipped, gives the reason, and exposes no fabricated active attempt. | Pending |
| Exact terminal | Open the correctness terminal, inspect both attempts, and press Escape. | The terminal names the exact occurrence and attempt-37-2. Selection, expansion, scroll, and focus return unchanged. | Pending |
| Decision states | Apply each delivery display input separately. | Recorded, pending, unknown, and confirmed remain distinct. Unknown does not clear the answer or imply completion. | Pending |
| Real decision | Submit a real later-round decision through the integrated service and return to the run. | The real receipt binds actor, action, occurrence, request, and revision. Capture the receipt and resulting engine event. Fixture values do not pass. | Pending |
| Save recovery | Repeat TRL-672's lost-response, explicit Retry, newer draft, second save, and conflict journey. | The original write identity survives Retry; the newer draft survives; conflict stops automatic saves. Retain exact HTTP records. | Pending |
| Beyond cutoffs | Repeat navigation and save with 501 nodes, 2001 edges, and 51 rounds. | Every item remains accessible. No arbitrary application limit rejects or silently stops the journey. | Pending |
| Live engine | Generate actual progress and later-round occurrences through the integrated engine. | Retain engine events and matching public snapshots. Static fixture transport does not establish engine scale. | Pending |
| Latency | Record five warmups, then 30 interactions for each measurement in both density cases. | Retain raw durations, p95, host identity, build identity, viewport, theme, zoom, and cache state. | Pending |

## Proposed latency targets

TRL-674 must accept or revise these targets before performance acceptance.

| Measurement | Proposed target | Start | End |
| --- | ---: | --- | --- |
| Selection to inspector | p95 at most 150 ms | The selection input reaches the editor. | The inspector paints the selected identity and fields. |
| Node search | p95 at most 250 ms | The search input changes. | The correct results and expanded ancestors paint. |
| Cached graph or run open | At most 2 seconds | The cached navigation starts. | The graph or run becomes usable with its selected identity. |

Count mounted outline rows and mounted round rows during each journey.
Record the viewport height, visible row count, and any overscan separately.
Propose a rendered-row budget from those measurements for TRL-674. This source invents no measured row budget.

Retain failures and unsupported interactions with their exact action and visible result.
Keep source, rendered, HTTP, engine, and production results separate in the final report.
