# Combined Langflow acceptance

These requirements remain open until matched execution evidence establishes each result.
A source merge, fixture pass, or historical receipt does not close another proof category.
TRL-697 owns system fixtures and integrated screen checks.
TRL-667 owns the sole engine candidate and matched engine execution.
TRL-698 owns installed-platform rehearsal. TRL-699 requires separate release authority.
F19 remains a later removal audit. This assignment removes no legacy code.

## Engineering requirements

Source: resource `01M3NWFP1CP769ZYGQGG61ZMKX`, section 9.
The following section quotes the source. Its historical statements are not current results.


All rows below define future checks. None records a pass from this investigation.

| ID | Acceptance probe | Required result and retained evidence |
| --- | --- | --- |
| F1 | Kill engine around submission acceptance and lost response, including terminal failure | One engine job or explicit `submission_unknown`; no duplicate native effect; correlation ledger |
| F2 | Two independent roots with several concurrent native waits; kill before/after each checkpoint | Same continuation and handles; one attempt per semantic step; trace comparison |
| F3 | Deliver duplicate, delayed, out-of-order, stale-epoch and forged completions | One accepted receipt and successor release; rejected authority recorded |
| F4 | Kill Trellis after reservation, before launch, after launch, after prompt receipt, before final persistence | Exact attempt recovery or explicit unknown; no replacement process |
| F5 | Lose engine worker during human and native waits | Proven continuation or execution error; no false success; retained native stop obligations |
| F6 | Pause/restart nested groups and loops before launch and around the first observed launch receipt | No group deadline from reservation alone; original deadline from observed launchedAt; half/quarter warnings; bounded rounds and unique occurrence keys |
| F7 | Cancel during launch, output, human decision, completion and failed stop | Persisted cancel, no new starts, late result isolation, eventual exact-attempt exit proof |
| F8 | Exact Review v71 plus synthetic join/NO/loop/human fixtures | Matching topology, input/output bytes, branches, limits, harness settings and policy projection |
| F9 | Equal start UUID after each terminal outcome; changed input under same UUID | Same execution for equal input; conflict for changed input; separate automatic error retry uses a new request |
| F10 | Two tabs edit metadata and graph; lost response; changes during autosave | No unseen overwrite; correct version; recoverable newest local draft |
| F11 | Direct sidecar access, draft execution, arbitrary Python, component substitution, wrong project grant | Request denied before execution; no credential in browser or logs; isolation evidence |
| F12 | Replay event stream after disconnect and after token output | Stable ordered milestones; explicit cursor gap; no promise of token replay |
| F13 | Old CLI commands, aliases, JSON, 501+ runs, no-wait, timeout and human wait | Compatible IDs, filters and exits; timeout leaves run active; waiting never grants readiness |
| F14 | Same-diff success across a push, waiver, other diff, deletion, failed CI, open finding, conflict | CLI and web match current readiness rules; head information does not change policy |
| F15 | Migrate saved graphs, legacy snapshots and browser drafts with unsupported features | Complete manifests and hashes; blocked diagnostics; original bytes remain available |
| F16 | Backup/restore with both engines, task/result links, Pages/attachments and conversation references | Restored identity and readable history; no worker replay or orphaned authority |
| F17 | Installed macOS and supported Linux targets; offline install, health loss, host restart, upgrade and rollback | Owned process count, sealed hashes, matched data and preserved native sessions |
| F18 | Aside render checks for editor/list/run/history states | Desktop/narrow/keyboard/focus/scroll proof; engine unavailable, conflict, approval, unknown, blocked migration and stop warnings |
| F19 | Caller and import audit after removal | No new path reaches legacy scheduler; all retained history and API consumers work |
| F20 | Kill before/after human decision claim, signal, queue, and receipt; lose acknowledgement | Equal decisionId/digest returns one accepted receipt; durable resume survives; generic 409 never counts as acknowledgement |
| F21 | Transfer epoch, expire/renew capability, deliver stale callbacks and pending completions | Old engine cannot dispatch; original native provenance remains; current delivery authority creates no new IDs or extended deadline |
| F22 | Let engine race ahead of submit response; crash before/after binding and admission commit | Closed admission permits no native effect; durable barrier resumes after exact binding; committed effects and stop obligations survive |

Existing test definitions provide comparison cases: [flow scope](https://github.com/0x962/trellis/blob/68304287f4674fcff7b55d4f27129b67595e4578/apps/server/src/services/flows/flows.test.ts#L51-L84), [success across heads](https://github.com/0x962/trellis/blob/68304287f4674fcff7b55d4f27129b67595e4578/apps/server/src/db/queries/flowAnswered.test.ts#L61-L90), [CLI readiness and pagination](https://github.com/0x962/trellis/blob/68304287f4674fcff7b55d4f27129b67595e4578/packages/cli/src/commands/ready/flowReadiness.test.ts#L92-L216), and [run rows](https://github.com/0x962/trellis/blob/68304287f4674fcff7b55d4f27129b67595e4578/apps/web/src/features/reviews/FlowRuns/components/FlowRun/buildFlowRunRows/buildFlowRunRows.test.ts#L137-L239). Their presence does not establish that they pass on an integration branch.

The feasibility owner must first pass F1 through F8 and F20 through F22 with deterministic agents and no provider credentials. Independent review must confirm that Langflow remains the sole graph scheduler. Failure to restore concurrent waits or immutable job identity stops cutover. A broad scheduler rewrite inside Trellis is not an acceptable patch.

After feasibility, implementation owners run focused package checks, affected linters, and type checks. CI proves the combined integration revision. Installed-host tests establish process, platform, and recovery behavior. Human release approval remains separate from all three. TRL-660 owns the resulting dependency graph and implementation tickets.

## UI requirements

Source: resource `01M3NWQ1185AB59CSB5611N1YZ`.
The following conditions quote the source.

### UI-F1: Type-specific authoring and keyboard connections

Every accepted component exposes its own editable fields, limits, defaults, validation, and account source. A keyboard-only journey must add a component, connect compatible ports, change a connection, and delete it with the specified confirmation. Group boundaries and Yes/No outputs must remain explicit. Cancel must restore field values. Save must retain accepted values when the inspector reopens.

### UI-F2: Identity and state must survive each journey

Trace one identity through discovery, editor, Start, run, terminal, results, and history. Preserve flow ID, version, engine, run, occurrence, attempt, ticket, diff, and reviewed head where each applies. A blocked migration never enables Start. A history selection retains its original name and target. Run results never infer success from a navigation default. Stop counts equal the displayed outstanding obligations. Back navigation preserves filters, expansion, selection, and scroll.

### UI-F3: Saved does not mean executable

Pending, failed, and stale publication states must name both revisions and preserve the saved document. Start must require a confirmed publication of the current saved revision. The server must recheck that pair. Old publication receipts cannot replace newer state. Existing runs retain their original publication. Test an engine outage during save and a late publication response after another edit.

### UI-F4: A request is distinct from a confirmed effect

Start retains its actor-scoped request identity through pending, confirmed, and unknown outcomes. Submission uncertainty never proves that no worker exists. Recovery must retain attempts, results, deadlines, and stop obligations. Both approval and rejection retain notes and their decision identity until acknowledgement. A receipt conflict never silently resubmits against a newer occurrence. Cancellation reports each outstanding exact-attempt stop until confirmed exit. A browser or terminal close never cancels work.

### UI-F5: Keep Close visible during narrow dialog scroll

At 320 by 568 and 320 by 900, Close remains inside the visible dialog after keyboard and pointer scroll. Long instructions and results do not cover a focused control. Escape closes only the top dialog and returns focus to its trigger. Enter inside notes does not submit a decision. Verify the canonical Sheet/Dialog implementation at 200% browser zoom and with the mobile keyboard.

### UI-F6: Large graphs and repeated rounds need a reviewable design

Review that design at desktop and narrow widths. Then verify the actual integration with 500 nodes, 2,000 edges, and 50 rounds. Progress updates must retain focus, selection, and scroll. Each terminal and result must remain bound to its selected occurrence and attempt. TRL-660 must define the response-time budget before performance acceptance; this review establishes no measured budget.

## Integrated browser evidence

Use Aside against actual integrated screens.
Record desktop, 320×568, and 320×900 CSS-pixel viewports in both themes.
Include 200% browser zoom, keyboard use, focus return, pointer scroll, and mobile keyboard behavior.
Retain screen-reader results, measured contrast, reduced motion, touch targets, and layout stability after data arrival.
Trace the selected occurrence through its exact attempt, terminal, result, history, and Back navigation.
Measure dense graphs with 500 nodes, 2000 edges, and 50 rounds.
These values are fixture sizes, not application maxima.

TRL-674 supplied these accepted budgets on September 29:

| Measurement | Budget |
| --- | --- |
| Selection to inspector, p95 | ≤150 ms |
| Search, p95 | ≤250 ms |
| Cached graph or run usable | ≤2 seconds |

Use five warmups and thirty measured interactions for each density case.
Record raw durations, host, build, viewport, theme, zoom, and cache state.
Measure rendered rows and overscan. A source count does not establish rendered density.

## D20 boundary evidence

Exercise each former boundary and the next value across save, publish, start, result, history, and clients.
Retain complete text, valid items, and access through pagination and virtualization.
Preserve protocol ranges, finite coordinates, positive sizes, backpressure, and explicit user deadlines.
Positive user-set minutes and rounds have no arbitrary maximum.
The opaque payload fixture proves only service retention when it executes successfully.
Its fixture publisher does not validate graph semantics or establish performance.

## Evidence records

Each executed check needs the exact combined source, fixture bytes, command or action, exit result, and retained artifact.
Keep source review, focused fixtures, CI, engine execution, browser checks, installed proof, and human approval separate.
A skipped, unavailable, or failed check remains explicit.
Retain Review input/output text, provider data, credentials, and private traces outside public reports.
