# Architecture

trellis is a local ticket tracker for work that humans give to coding agents.
One server on the machine owns all data. The web app, the mobile app, and the
CLI reach that server over HTTP. The desktop host requires a bearer token and binds
`127.0.0.1`. The standalone server requires authentication when `TRELLIS_AUTH_TOKEN` is set. Read [SECURITY.md](../SECURITY.md) for the security
model.

## Stack

| Layer | Choice | Version |
|---|---|---|
| Runtime, package manager | Bun | 1.3 |
| Monorepo | Bun workspaces, Turborepo | turbo 2.10 |
| Language, lint, format | TypeScript, Biome | 7.0, 2.5 |
| Server | Hono | 4.13 |
| API | oRPC contract-first, Zod | 1.15, 4.5 |
| Database | PGlite with `pg_trgm`, Drizzle ORM, drizzle-kit | 0.5.8, 0.45, 0.31 |
| Web | React, Vite, TanStack Router, Query, Table, Virtual | 19, 8, current |
| UI primitives | Base UI, Tailwind, own tokens in `packages/ui` | 1.8, 4.3 |
| Editor, palette, drag and drop, motion, toasts, icons | Tiptap, cmdk, pragmatic-drag-and-drop, `motion/mini`, sonner, lucide-react | current |
| Flow canvas, flow layout | @xyflow/react, local rank layout | 12.11 |
| Fonts | BerkeleyMono, then JetBrains Mono from fontsource | 5.3 |
| Mobile | Expo, expo-router, React Native, NativeWind, FlashList, `expo-sqlite/kv-store`, `react-native-sse` | 57, 0.86, current |
| Desktop | Electron, macOS SMAppService | 44.3.0 |
| Native execution | Node, node-pty, fs-ext, Koffi | 26.8.2, 1.2.0-beta.15, 2.1.1, 3.3.0 |
| CLI | citty | 0.2 |
| Releases | changesets | |

PGlite ships `pg_trgm` as a loadable contrib module. `tsvector` is core.

## Repository layout

```
trellis/
├── apps/
│   ├── server/   @trellis/server   Hono, oRPC handlers, database worker, gh poller, agent runner
│   ├── web/      @trellis/web      React single-page app
│   ├── desktop/  @trellis/desktop  macOS window, preload bridge, background service
│   ├── runtime/  @trellis/runtime  persistent processes, terminal bytes, process ownership
│   └── mobile/   @trellis/mobile   Expo app
├── packages/
│   ├── api/      @trellis/api      Zod schemas, refs, errors, contract, client, events, query keys
│   ├── ui/       @trellis/ui       design tokens, Base UI wrappers, visual primitives
│   ├── runtime-protocol/          private socket protocol and client
│   └── cli/      @trellis/cli      the `trellis` command, HTTP only
├── docs/                           this reference, the agent setup guide, the diagram
└── scripts/                        the `bun run check` runner
```

The dependency graph is a star. Server, web, mobile, and CLI import `api`. The
CLI imports the contract as a type only. Only web imports `ui`. Each package
exports TypeScript source and has no side effects.

The standalone data home is `~/.trellis`, and `TRELLIS_HOME` overrides it.
It holds `db/`, `attachments/`, `backups/`, `agents/`, `runtime/`, and `server.log`.
Project agent worktrees live under `agents/<run id>/work`. The runtime retains process records and output under `runtime/`.
The server log rotates at 10 MB and keeps five files.
The standalone port is 4521 (`TRELLIS_PORT`) and the host is `127.0.0.1` (`TRELLIS_HOST`).

## Desktop execution

The macOS app stores its profile in `~/Library/Application Support/Trellis`.
Its default database directory is `host` under that profile.
Settings > Desktop > Choose data directory selects an existing home in place.
The app and Swift helper read the same `selected-home.json` file in the profile.
The selection resolves to an absolute path and persists across restarts.
Its Swift helper registers through `SMAppService` and starts the bundled host through launchd.
The host keeps its port across restarts, so the renderer retains its origin.
Close or quit detaches the window. The background host and agent processes continue.
The explicit Quit Trellis Completely action stops owned processes and unregisters the helper.
The host stops new launches during shutdown. Open Trellis to start the helper.
An unconfirmed process prevents a successful stop.

The Bun host owns PGlite. A separate Node runtime owns agent PTYs.
Its private Unix socket uses protocol 10. A lifetime file lock permits one runtime owner.
Each attempt has one immutable identifier, a token hash, retained terminal output, and a process record.
The runtime keeps complete records for active processes and subscribers. The runtime retains up to 500 unsubscribed exited records for up to seven days. It caches eight records on demand.
Inventory responses yield between records so terminal input can proceed. Clients use bounded pages when the runtime advertises `list-pages`.
Output readers receive bounded chunks with byte offsets.
The runtime preserves delivery identifiers before it writes input. An uncertain write remains unknown until an agent receipt confirms it.
A runtime restart never substitutes a new process for an unresolved attempt.
Natural leader exit stops the remaining members of its OS session. Explicit stop also includes descendant sessions observed while the leader remains live.
The runtime reports exit only after cleanup and output completion. Failed cleanup records an unknown result.
A descendant that leaves its session and loses its parent before inspection requires separate process inspection.

Built-in harnesses launch through `HarnessHost` with an interactive CLI in a PTY.
Ticket, flow, and session agents use native permission bypass settings.
The first prompt contains only the saved run instruction.
Claude hooks, the OpenCode plugin, and the Pi extension report provider identity, prompt receipts, tools, results, and errors.
Codex runs one private app-server per attempt. Its native terminal and Trellis event client connect to that engine.
The Codex adapter maps native thread, turn, tool, result, and error events into the runtime journal.
Muse runs one private `muse serve` session host per attempt. The Muse bridge speaks the Muse Session Protocol over its stdio, maps session, turn, item, and result notifications into the runtime journal, and prints the transcript to the terminal.
Every built-in start waits for the initial native prompt receipt. Each follow-up requires its own receipt. Busy providers queue follow-ups for their next turn.
The desktop starts HTTP before it resolves the login environment. Git, GitHub, and new agent launches await the cached environment in their server thread.
A failed login shell returns a tool error. Existing agent controls use their saved launch environment.
Each launch selects the active host release on PATH, including when the runtime predates that host.
`HarnessHost` exposes start, resume, send, interrupt, stop, status, and output APIs for native agent assignments.
Its immutable launch descriptors retain configuration. The runtime supplies process status and observed provider identity.
Assignment responses expose runtime-derived `processStatus` separately from the agent turn result. Terminal selection and process controls use that process status.
Current observations include the process check time, control availability, turn activity, and turn outcome.
The host reports `working` only for a controllable process with an active turn and no final outcome.
An exact prompt receipt confirms delivery. A provider turn and its observed activity time protect interrupt requests.
The runtime inspects the OS process before it reports status or permits input.
The host uses these observations for flow completion.

Database reservations and runtime attempt identifiers prevent duplicate starts.
The host sends human comment mentions to active ticket agents.

Native project agents use Git worktrees under `agents/<run id>/work`.
The ticket page opens Activity first and puts its top-level tabs below the page header.
Activity shows the centered ticket details, properties, attachments, timeline, and comments.
The Agent, Changes, and Flows tabs use the page width for the terminal, pull request changes, and local flow runs.
The authenticated terminal stream replays retained bytes and then pushes output and process observations.
The terminal WebSocket carries ordered input and binary output outside the database request path after attachment.
A capability handshake selects the persistent binary runtime channel or the compatible RPC adapter.
Live output uses a memory buffer and an ordered asynchronous disk log.
Parser acknowledgments bound output across the browser connection.
Terminal instances retain their buffers and subscriptions across page switches. See [terminal transport](terminal-transport.md).
The terminal sends keyboard input and resize events to the runtime. An explicit reconnect resumes from the last displayed byte.
`trellis doctor --json` reads runtime diagnostics without starting the runtime.

Native flows freeze the saved graph and inline node instructions for each execution.
Each node occurrence binds to an ordinary agent attempt or a versioned human decision.
Gate results use complete YES or NO responses. Skipped branches remain explicit, and joins wait for their incoming paths to settle.
A box with a time limit starts its clock when the first worker process inside it starts. The deadline also reaches the runtime process as its timeout, so it remains effective after a host crash.
The prompt of a step names each time limit around it and the time left. The reconcile loop sends the worker a message when half of the budget is left, and again at a quarter.
A step that runs an agent can name a harness, a model, and an effort. A step without one takes the harness of its flow, and a flow without one runs claude. An execution reads its frozen doc, so a later change to the flow leaves a running execution alone.
Cancellation retains files and output and records any worker whose stop remains unconfirmed.

The desktop installs `~/.local/bin/trellis` from the active host release.
Its default connection reads the selected data directory's current port and token on each invocation.
An explicit URL uses explicitly supplied credentials and does not read the selected desktop connection.

The desktop retains each host resource version under `releases` in its application data directory.
An application replacement can reuse that version while its runtime owns active sessions.
The update status blocks an incompatible runtime protocol and retains the prior host until work stops.

A directory handoff verifies the recorded owner against the standalone launchd service.
After confirmation, it disables that service and waits for the owner to exit.
The offline helper holds the database and runtime locks before it copies the database into `backups/desktop-handoff-<id>`.
It then applies schema migrations. It pauses automation in one transaction.
External agent records retain their states. External clients need the desktop bearer token to update tickets.
An incomplete handoff marker blocks startup until the retained backup and operation state receive review.
The previous desktop home retains its files when the selected home changes.

A flow recovery copy remains until the host acknowledges its saved graph.

Read the [implementation status](desktop/implementation-status.md), [desktop plan](desktop/trellis-desktop-plan.md), and [real acceptance report](desktop/acceptance/2026-09-14-native-real/report.md) for scope and measured results.

## Domain rules

A ticket has at most one open ticket-agent assignment. A status change
does not replace or close that assignment. A person must remove the assignment
before another agent can take the ticket.

- Projects form a tree. A root has a key (`^[A-Z][A-Z0-9]{1,9}$`) and a ticket counter. Tickets are `KEY-n` across the whole tree.
- Ticket numbers are never reused. A delete leaves a gap. A key is immutable once the counter is above zero (`KEY_LOCKED`).
- Nothing moves across roots: no ticket, no parent, no sub-project (`CROSS_ROOT_MOVE`). A ticket or a project cannot be its own ancestor (`PARENT_CYCLE`).
- Statuses belong to a project. A root starts with Todo (todo, default), In Progress (started), Agent Review (review, agent reviewer), Human Review (review, human reviewer), Done (done), and Canceled (canceled).
- A sub-project inherits the status set of the nearest ancestor until it creates its own set. The owner of a project is the nearest ancestor or self that owns statuses.
- Invariant: `tickets.status_id` belongs to the owner of `tickets.project_id`. The function `remapScope` restores the invariant after a first-status create, a clear, a re-parent, and a project move.
- The remap matches on name and category first, then on the lowest-position status of the same category, then on the default status of the owner.
- Every status-to-status move is legal.
  The `category` of a status is immutable after creation.
- `started_at` is set once, when a ticket leaves todo. `completed_at` is set when a ticket enters done or canceled, and cleared when it leaves.
- Priority is none, urgent, high, medium, or low.
- The root project of a tree owns every label and every label group of the tree. Every project of the tree reads and writes the one set.
- A label takes one group or no group. A group is exclusive: a ticket holds one label of a group at most, so a second label of that group replaces the first one.
- A label name is unique inside its group, or among the labels of the root that have no group, without regard to case. A name holds no comma and no slash, it is 1 to 80 characters, and it is never `none`.
- A label ref is a ULID, a name, or `group/name`. A bare name takes the label with no group first, then the one label of that name in a group. Two grouped labels of that name are `LABEL_AMBIGUOUS`.
- A label color is one of nine hues: gray, red, orange, yellow, green, teal, blue, purple, and pink. A create with no color takes a hue that no label of the root uses.
- A label delete is a hard delete. It takes the label off every ticket, and it leaves `tickets.version` and `tickets.updated_at` as they are.
- Every non-GET request sends the header `x-trellis-actor: <human|agent>:<name>`. The name is printable ASCII without a colon, 1 to 64 characters.
- A missing header is `ACTOR_REQUIRED` and a malformed one is `ACTOR_INVALID`. A GET ignores the header. The header rejects the kind `system`, which trellis reserves for `system:trellis`.
- The optional header `x-trellis-session` is stored in `activity.meta.session`. trellis stores the name and the kind of an actor, and nothing else.
- The service enforces the agent policy, so curl obeys it too. Agents can move tickets to Done. An agent cannot delete a ticket, a project, a label, or a label group (`AGENT_CANNOT_DELETE`, 403) without `force`.
- An archived project serves reads. Every mutation on it fails with `PROJECT_ARCHIVED`.
- `tickets.version` rises on every row change. `update` and `move` accept `expectedVersion` or the header `If-Match`. A mismatch is `VERSION_CONFLICT` (412) with the current row.
- `updated_at` moves only on user-visible activity: a ticket field, a comment, an attachment, or a pull request link. A reorder, a remap, and a poller CI change raise `version` only.
- A delete is a hard delete. A ticket delete nulls the `parent_id` of its children, then cascades comments, attachments, pull request links, and activity. The blob collector then removes unused files.
- A project delete needs an empty subtree or `force`.
- An epic groups the tickets that deliver one plan inside a project. It is its own record with a name, a slug, and a markdown description that holds the plan. An epic is never a ticket.
- A ticket belongs to at most one epic (`tickets.epic_id`). The epic and the ticket share one root (`CROSS_ROOT_MOVE`). A ticket in an epic can sit in any project of that root.
- An epic stores no state. Its counts by status category come from its tickets. Its state is `done` when it has at least one ticket and every ticket is done or canceled. Otherwise it is `open`, so an epic with no ticket is open.
- An epic delete sets `epic_id` and `wave_id` NULL on its tickets, raises their `version`, records field `epic` for each ticket, records field `wave` for a ticket that held one, and emits `ticket.updated` for each. An agent needs `force` (`AGENT_CANNOT_DELETE`). A project delete cascades its epics.
- A wave is one ordered phase of an epic. It is its own record with a name, a slug, and a position. A wave belongs to one epic, and an epic delete cascades its waves.
- A ticket belongs to at most one wave (`tickets.wave_id`), and that wave belongs to the epic of the ticket. A ticket with no epic has no wave (CHECK `tickets_wave_needs_epic`).
- A ticket write that gives `wave` sets the epic of the ticket to the epic of that wave in the same write. An `epic` value in that write that names another epic, or `epic: null`, is `WAVE_OUTSIDE_EPIC`.
- A ticket write that gives an `epic` that differs from the current epic, or `epic: null`, sets `wave_id` NULL.
- A wave stores no state. Its counts by status category and its state come from its tickets, with the rules of the epic.
- A wave delete sets `wave_id` NULL on its tickets, and each ticket stays in its epic. The delete raises their `version`, records field `wave` for each ticket, and emits `ticket.updated` for each. An agent needs `force` (`AGENT_CANNOT_DELETE`).

### Project notes

A note is titled markdown on one project. Agents read project notes through
the notes API and ticket briefs. `notes` holds one row per
note with its `audience` (`all` or `worker`), an optional
`expires_at`, and the actor of the last write. A read collects the notes of
the project and of every ancestor, newest change first, and drops an expired
note. A title is unique in its project without case; a repeated title is
`DUPLICATE`. A human and an agent can create, update, and delete a note. An
archived project serves reads and refuses writes. A project delete cascades
to its notes.

The API is `notes.list`, `notes.get`, `notes.create`, `notes.update`, and
`notes.delete`. The event `notes.changed` names the owning project and
invalidates every note query. The CLI verb is `trellis notes`, and the web route is `/p/<project path>/notes`.
Repository instructions describe note behavior. The ticket brief carries note content.

### Epics

`epics` holds one row per epic: `project_id`, `root_id`, `slug`, `name`,
`description`, and the actor of the last write. An EpicRef is a ULID or
`KEY/slug`, such as `OP/routine-runtime`. Two epics of one root never share a
slug; a taken slug is `DUPLICATE` with field `slug`. A create without `slug`
derives one from `name`, and a derived slug that collides takes the lowest free
numeric suffix from `-2`. An archived project serves reads and refuses every
epic write (`PROJECT_ARCHIVED`).

A ticket joins an epic through `epic` on `tickets.create`, `tickets.update`,
and `tickets.updateMany`; `null` clears it. The service resolves the ref,
checks the root, and checks `PROJECT_ARCHIVED` on the project of the epic. A
change of `epic` records field `epic` with the epic refs as `from_value` and
`to_value` and the ids in `meta.fromId` and `meta.toId`. `TicketSummary`
carries `epic` as `{id, ref, name}` or `null`.

The API is `epics.list`, `epics.get`, `epics.create`, `epics.update`, and
`epics.delete`. `epics.get` returns the summary, the waves of the epic in
position order, and the tickets in number order. The event `epics.changed {projectId, id}` fires on a create, an
update, and a delete. Every ticket row copies the epic name and ref, so the
event refetches the `epics` family, the `tickets` family, and `projects.list`.
The counts of an epic and of each wave follow its tickets, so a ticket
event whose fields include `epic`, `wave`, `status`, or `completedAt`
invalidates the `epics` query family. `ProjectSummary.openEpicCount` counts the open epics of that project
alone, and the sidebar prints it.

The ticket brief names the epic. The header gains
`- Epic: <name> (<ref>), <done> of <total - canceled> done`. After the
description, `## Epic: <name>` prints the plan in full, and `## Epic tickets`
lists every ticket of the epic in number order as `- OP-29 Title (Done)`, with
`(this ticket)` after the current one. The brief of a ticket in a wave
also gains the header line
`- Wave: <name> (<ref>), <done> of <total - canceled> done`. When the epic
has waves, `## Epic tickets` prints one `### <wave name>` heading per
wave in position order, with the tickets of that wave in number
order below it. A wave with no ticket prints its heading alone.
`### No wave` comes last, and it prints only when a ticket of the epic
holds no wave. The launch instruction stays title plus
description; an agent reads the epic through `trellis brief`.

The CLI verb is `trellis epics` with `list`, `show`, `create`, `edit`, `add`,
`remove`, and `delete`. `--epic <ref>` joins `create`, `sub`, and `edit`
(`--epic none` clears), and `--epic <ref|none>` joins `list`. The web routes
are `/p/<project path>/epics` and `/p/<project path>/epics/<slug>`.

### Waves

`waves` holds one row per wave: `epic_id`, `root_id`, `slug`, `name`,
and `position`. A lower position comes first. A WaveRef is a ULID or
`KEY/epic-slug/wave-slug`, such as `OP/routine-runtime/phase-1`. Two
waves of one epic never share a slug; a taken slug is `DUPLICATE` with
field `slug`. A create without `slug` derives one from `name`, and a derived
slug that collides takes the lowest free numeric suffix from `-2`. A create
puts the wave after the last wave of the epic. A delete leaves a gap
in the positions, and the order still holds. A wave write leaves
`updated_at` and the actor of the epic as they are, so the order of
`epics.list` stays. An archived project refuses every wave write of its
epics (`PROJECT_ARCHIVED`).

A ticket joins a wave through `wave` on `tickets.create`,
`tickets.update`, and `tickets.updateMany`; `null` clears it, and the ticket
stays in its epic. The service resolves the ref, checks the root
(`CROSS_ROOT_MOVE`), and checks `PROJECT_ARCHIVED` on the project of the epic.
`resolvePlacement` in `apps/server/src/services/tickets/placement.ts` holds the
two write rules, and `updateMany` applies them per ticket. A `wave` value
alone never fails with `WAVE_OUTSIDE_EPIC`, because it sets the epic. A
change of `wave` records field `wave` with the wave refs as
`from_value` and `to_value` and the ids in `meta.fromId` and `meta.toId`.
`TicketSummary` carries `wave` as `{id, ref, name}` or `null`.

The API is `waves.create`, `waves.update`, `waves.reorder`, and
`waves.delete`; `epics.get` is the read. The router reads `{+name}` as the
rest of the path, so no route continues after an epic ref: `create` and
`reorder` take `epic` in the body. `waves.reorder` takes every wave
of the epic once, in the new order, and writes the positions 0 to n - 1. A list
that omits a wave, repeats one, or names a wave of another epic is
`WAVE_OUTSIDE_EPIC`. Every wave write emits
`epics.changed {projectId, id}` with the epic of the wave, because
`epics.get` carries the waves and every ticket row copies the wave
name and ref.

The CLI verb is `trellis waves` with `list`, `create`, `edit`, `order`,
`add`, `remove`, and `delete`. `list`, `create`, and `order` take an EpicRef;
`edit`, `add`, and `delete` take a WaveRef. `order` takes every wave
slug of the epic in the new order and sends the full refs. `add` puts tickets
in the wave and in its epic, and `remove` takes tickets out of their
wave and leaves them in the epic. `--wave <ref>` joins `create`,
`sub`, and `edit` (`--wave none` clears), and `--wave <ref|none>`
joins `list`. `trellis epics show` prints the waves with their counts,
then one ticket table per wave in position order. A `no wave` table
comes last when a ticket of the epic holds no wave.

### Ticket dependencies

`ticket_deps` holds one directed edge for each pair of tickets. `ticket_id`
waits for `depends_on_id`. The primary key uses both columns and permits one
edge for a pair. Both foreign keys cascade on ticket deletion. `source` is
`manual`, `parsed`, or `derived`. A check refuses an edge from a ticket to
itself.

Every dependency belongs to one project root. A manual write resolves every
ticket before it changes an edge. It refuses a cross-root edge and a cycle. A
cycle error names the path from the target ticket back to itself. A repeated
manual write changes a parsed or derived edge to manual.

`TicketSummary.waitsOn` lists each dependency that is not done or canceled.
`TicketSummary.releases` lists each ticket that waits for this ticket.
`TicketSummary.ready` is true when the ticket is Todo and each dependency has
a done or canceled status. `tickets.get` also returns answered questions that
have left `waitsOn`.

The API writes dependencies through `tickets.create` and
`tickets.updateDependencies`. The routes are `POST /api/tickets` and
`PATCH /api/tickets/{ticket}/dependencies`. `tickets.importDependencies` at
`POST /api/tickets/import-dependencies` imports the dependency lines of one
epic. `tickets.get` at `GET /api/tickets/{ticket}` reads both directions.

A dependency uses TicketRef for the target and for every related ticket. A
TicketRef is a ULID or `KEY-n`. The CLI flags are `trellis create --after`,
`trellis edit --after`, and `trellis edit --not-after`. `trellis deps
<TicketRef>` prints both directions and each derived pull request stack.
The web route `/t/<KEY-n>` shows the chain, the ready sentence, and each
answered question. An epic route also shows the `waits` and `releases` cells.

### Ticket contract

The contract lives on the `tickets` row. `result` is text. `files`,
`leave_alone`, `verify`, and `review_focus` are JSON arrays. Each array has a
database check for the JSON array type. `Ticket.contract` returns the five
fields as one object.

`tickets.setContract` replaces all five fields in one write at
`PUT /api/tickets/{ticket}/contract`. The write accepts `expectedVersion` and
raises the ticket version. `tickets.get` reads the contract. The import API is
`tickets.importContract` at `POST /api/tickets/import-contract`. It fills empty
`files`, `verify`, and `review_focus` fields from an epic ticket description.

The contract uses TicketRef, a ULID or `KEY-n`. The CLI verb is `trellis
contract`. `trellis contract set` takes one result and repeated `--file`,
`--leave-alone`, `--verify`, and `--focus` flags. `trellis contract show`
prints the stored fields and the evidence floor that the file paths imply.

The web route `/t/<KEY-n>` shows the contract after the ask. It derives
`Evidence owed` from the files and the repository path rules. The review route
`/reviews/<owner>/<repo>/<number>` reads `review_focus` from the linked ticket.
The ticket brief prints the same contract fields and evidence floor.

### Pull request summaries

`pr_summaries` holds one row for each pull request and head SHA. Its composite
primary key is `(pull_request_id, head_sha)`. The row stores `headline`, `why`,
`watch`, `created_at`, and `updated_at`. A delete of the pull request cascades
to its summaries.

The server compares a write with the head that GitHub reports before it opens
the transaction. It applies the STE check to all three fields. A refusal stores
nothing, and a warning returns with the stored summary. A rewrite keeps
`created_at`. `readSummary` sorts by that value, so a rewrite of an older head
does not make it newest.

The API is `pullRequests.readSummary`, `pullRequests.readSummaryHead`, and
`pullRequests.writeSummary`. Their routes are `GET /api/prs/{id}/summary`,
`GET /api/prs/{id}/summaries/{headSha}`, and
`PUT /api/prs/{id}/summaries/{headSha}`. `{id}` is the ULID of the stored pull
request, and `{headSha}` is 1 to 64 characters.

The CLI accepts a pull request number, a GitHub URL, or
`owner/repo#<number>`. A number must match one row in the local list. A write
can also open one match from the signed-in GitHub account.
The CLI verb is `trellis summary` with `write`, `show`, and `body`.

The web route `/reviews/<owner>/<repo>/<number>` shows the summary above the
review focus. It shows a revision warning when the stored head SHA differs
from the displayed revision. On a ticket or epic, each row for a pull request
includes the current-head summary in its evidence count.

### Pull request evidence

`pr_evidence` holds one immutable record for a pull request head. A row stores
its ULID, pull request, head SHA, kind, JSON record, optional blob SHA-256,
actor, and creation time. A delete of the pull request cascades to its evidence.
Stored files use the shared content-addressed blob store.

The evidence kinds are `before`, `after`, `capture`, `clip`, `console`,
`verify`, `test`, `contract`, `migration`, `picture`, and `equivalence`.
Each kind has a strict record schema. A repeated evidence ULID returns the
existing row only when every stored value and the actor match. Another value
with that ULID is `DUPLICATE`.

The frontend floor is summary, after image, before image, capture record, and
console list. The backend floor is summary, verify record, test proof, and
contract table. A mixed pull request owes both floors. Migration risk adds a
migration plan. Auth, migration, dependency, or shared-type risk adds a
picture. Deleted-test risk adds equivalence proof.

The API is `pullRequests.listEvidence`, `pullRequests.readEvidence`, and
`pullRequests.writeEvidence`. The routes are `GET /api/prs/{id}/evidence`,
`GET /api/evidence/{evidenceId}`, and
`PUT /api/prs/{id}/evidence/{evidenceId}`. The file route is
`GET /api/evidence/{evidenceId}/file`. Pull request and evidence identifiers
are ULIDs. A write must name the head SHA that GitHub reports.

The CLI uses the summary ref grammar: a number, a GitHub URL, or
`owner/repo#<number>`. The CLI verb is `trellis evidence` with `add`, `list`,
and `check`. `check` refreshes the pull request, computes its current-head
floor, prints each missing record and command, and exits 1 for an incomplete
floor.

The CLI checks open linked pull requests before an actor moves a ticket to
`human-review`. It stops at the first floor that is incomplete for the current
head. It refuses an agent and prints the missing list. It prints the same list
for a human but permits the human's move. The server does not apply this CLI
guard in `tickets.move`.

The web route `/reviews/<owner>/<repo>/<number>` shows current-head evidence
after the review focus. It renders frontend and backend records according to
the pull request kind. The route shows each missing item with its fill command.
The ticket route `/t/<KEY-n>` shows one evidence card for each linked pull
request.

### Ticket answers

An answer lives in `comments`. The body starts with `Answer: option <n>.` and
then holds the reason. The option is an integer from 1 through 99. The target
ticket must have a human review status and a description that starts with a
numbered option list.

`tickets.answer` writes the comment and moves the question to the Done
category in one transaction. It also adds one `review_deliveries` row for each
open native agent run on a ticket that waits for the question. The delivery
loop sends the answer after the transaction commits.

The API route is `POST /api/tickets/{ticket}/answer`. It accepts TicketRef,
`option`, `reason`, and optional `expectedVersion`. TicketRef is a ULID or
`KEY-n`. The response returns the ticket, the answer comment ULID, and the
agent deliveries.

The CLI verb is `trellis answer <TicketRef> --option <n> --reason <text>`.
The web route `/t/<KEY-n>` replaces the work regions of a question with its
options, recommendation, reason field, released tickets, and Answer action.
The same route shows an answered dependency under `Applies` on a waiting
ticket.

`Ticket.answeredQuestions` reads the last human comment that matches on each
done question that the ticket waits for. The API can accept an agent actor,
but an agent answer does not enter `answeredQuestions`.

### Epic resources

`epic_resources` holds one resource for one epic. Its kind is `doc`, `link`,
`image`, or `file`. A document stores `body`, and a link stores an HTTP or
HTTPS `url`. An image or file stores its blob SHA-256, size, and MIME type.

Each row also stores a name, an optional ticket, the actor, and timestamps.
When a row names a ticket, that ticket must belong to the resource epic. Epic
deletion cascades to its resources. Ticket deletion sets `ticket_id` to NULL.
An image accepts PNG, JPEG, GIF, WebP, or AVIF.

The API is `resources.add`, `resources.list`, `resources.update`, and
`resources.remove`. The routes are `POST /api/resources`,
`GET /api/resources?epic=<EpicRef>`, `PATCH /api/resources/{id}`, and
`DELETE /api/resources/{id}`. `PATCH` changes a document body only. The blob
route is `GET /api/resources/{id}/blob`.

Add and list use EpicRef, a ULID or `KEY/slug`. Add can also use TicketRef, a
ULID or `KEY-n`. Update, remove, and blob reads use the resource ULID. The CLI
verb is `trellis resource` with `add`, `list`, and `rm`.

The web route `/p/<project path>/epics/<slug>` shows all epic resources in a
section that starts closed. A document opens in an editor. On desktop, a link
opens in the in-app browser and an image opens in a sheet. Other browsers open
links and images in a new tab. A file downloads from its blob URL.

The in-app browser is one sheet in the shell sheet stack, and every link in the
app reaches it. On desktop a control that leads to an HTTPS page opens that
sheet over the page the person reads. The sheet header carries Open in browser,
which hands the address to the browser of the operating system.

The route `/t/<KEY-n>` shows a resource when the ask or contract names its
path. The match uses a complete path token or its last path segment. A plain
title in prose does not name a resource.

### Ticket outcomes

The outcome lives in the `outcome` text column of `tickets`. Its default is
the empty string. A write requires one non-empty sentence. The write accepts
`expectedVersion`, raises the ticket version, records field `outcome`, and
emits `ticket.updated`.

The API is `tickets.setOutcome` at `PUT /api/tickets/{ticket}/outcome` and
`tickets.get` at `GET /api/tickets/{ticket}`. Both use TicketRef, a ULID or
`KEY-n`. `Ticket.outcome` is the stored string.

The CLI verb is `trellis outcome` with `set` and `show`. `set` applies the STE
check before it calls the API, and it refuses a text with an STE error. The
web route `/t/<KEY-n>` shows the outcome after the evidence. It shows an empty
state while the stored string is empty.

### Pull request reviews

The `reviews` API owns local PR discussion. `pull_requests.review_retained`
keeps a standalone review after its last ticket link disappears. Ticket and
project deletion preserve retained PRs. The GitHub poller includes them.

`review_revisions` stores the complete patch and GitHub metadata for a base/head
commit pair. The comparison merge base identifies the old file contents.
The new file contents come from the head repository, including fork PRs.
GitHub calls run through prepared services, outside database transactions.
A second head/base read detects a PR change during a diff fetch.

`review_threads` holds one JSON document per root thread. The document contains
its anchor, author, session, replies, reactions, and resolution state.
A body with a ```` ```suggestion ```` block also carries `suggestion`: the original
lines of the anchor, read from the patch of the revision or sent by the composer for
a line outside the hunks, and a state of `open`, `applied`, or `outdated`.
`reviews.apply` reads each file at the pull request head, checks the original lines,
and commits the new contents on the head branch with one `createCommitOnBranch`
GraphQL mutation. It resolves the threads and records the commit. A refresh moves an
open suggestion whose lines still stand to the new revision and marks the others
outdated. `reviews.submit` posts the named threads as GitHub review comments of the
submission through the pull request reviews API; without `threadIds` it posts the
summary only.
Message edits require the expected version. The database serializes writes.
Review comments remain local. The review form submits its comment, approval, or
change request to GitHub. The same request refreshes the stored pull request and
writes activity for every linked ticket.

`reviews.prs` lists every retained pull request, or, with a `project`, every
pull request linked to a ticket of that project or held in one of its repositories.
The web route `/reviews/$owner/$repo/$number` uses the Trellis shell. A
`project` search param names the project whose Diffs page opened the review.
`@trellis/ui/review` parses the unified diff and draws it with virtual scroll,
line selection, and thread annotations. Review styles live in `packages/ui`.
Drafts persist in browser storage until the user submits them.
The `reviews.changed` event invalidates local review queries after commit.
Current GitHub status polls separately from the saved diff revision.

`apps/server/src/gateway.ts` owns the optional localhost gateway.
It reads the shared route file and forwards configured local hostnames.
Read [the review guide](reviews.md) for commands and review behavior.

### Agent runs

An agent run stores its name, kind, and instruction at launch. A ticket agent names one ticket.
The row retains the project path and ticket identifier so its history remains readable.

`agentRuns` exposes start, resume, stop, refresh, send, output, session inspection, terminal input, and terminal resize operations.
`GET /api/agent-runs/:id/terminal/stream` pushes terminal bytes and inspected process status through an authenticated SSE connection.
The runtime owns each process through a distinct execution attempt. Each attempt has an identifier, generation, and token hash.
The runtime keeps the record and the output of an exited process for 7 days, and at most 500 exited records at any time.
The oldest exits leave first. The sweep runs at boot, after every exit, and once an hour.
A stable start request identifier returns its existing run instead of a new launch.
A changed target rejects reuse of that identifier.

`agentRuns.start` accepts an optional harness configuration and a canonical model ID for the assignment.
The harness configuration includes its preset, model, and optional effort. The API validates effort against the selected harness and model.
An omitted model uses the configured default. Custom commands reject explicit model overrides.
`agentRuns.resume` accepts a model override and otherwise retains the previous attempt's model and effort.

The assignment plus button opens a dialog with Harness, Model, and the supported effort choices.
The effort label follows the harness: Effort for Claude, Reasoning effort for Codex, Thinking level for Pi, and Variant for OpenCode.
The dialog hides effort when the selected model has no supported options.
Ticket assignment returns after it saves the assignment and attempt. A tracked background task prepares the workspace and starts the agent.
The dialog closes and selects the Agent tab, which shows startup progress and launch errors without blocking the ticket.

Model IDs use Vercel AI Gateway names throughout Trellis. [The model catalog and guide](MODELS.md) describe the choices and harness mappings.

`agentRuns.setModel` interrupts a running turn, stops its process, and resumes the same assignment with the selected model.
The assignment retains its ticket, workspace, account, and provider conversation.
The project and account defaults stay unchanged.

Each model change requires the current attempt ID and a request ID. A repeated request returns the existing attempt.
The CLI exposes `agents start --model`, `agents resume --model`, and `agents model <id> --model`.
The session API can inspect the observed model through `agentRuns.session` with `include: ["model"]`.

Project settings store the repository directory.
A project can inherit its repository directory from its ancestors.

Statuses do not store agent settings. A ticket transition does not change its agent assignment.
An agent restart preserves the workspace and resumes a compatible provider conversation.

Every preset runs its command through a local PTY. Claude hooks identify ready, active, and completed turns.
`launchCommand.ts` sends the saved run instruction without added assignment context.
For a ticket assignment, `reserve.ts` saves the text from `assignmentInstruction` in `services/brief.ts`: the ticket, the branch of the worktree, and the `trellis` commands.
The launch supplies the server URL, actor, run identifier, and attempt token through environment variables.
Each new agent in a configured repository uses a Git worktree under its run directory. This includes sessions, ticket agents, and flow agents.
API run states come from inspected runtime processes. The database records assignment closure in `closed_at`.
Periodic runtime checks request the attempt identifiers of open database assignments.
Sidebar work indicators request assigned runs. Individual agent views request their run identifiers.
An active background launch reports `starting` until the runtime has a process.
Otherwise, a missing runtime record produces `interrupted`; an observed process exit produces `exited` or `failed` from its exit code.
A failed launch retains its error. A stop retains the workspace and output after the runtime confirms process exit.

The ticket page uses three separate metric definitions. Tokens burned sums the latest provider-recorded cumulative total for each agent session.
Multiple execution attempts for one agent session contribute only the largest cumulative total. A ticket shows Unavailable when any agent run has no recorded total.
A ticket with no agent run also shows Unavailable tokens, because no provider recorded a total for it.
Time burned sums `elapsedMs` for every execution attempt on the ticket. It measures process time, not ticket age.
A ticket with no agent run has zero time burned. An attempt without a runtime duration makes time burned unavailable.
Age is the current time minus `tickets.created_at`.

### Sessions

A session holds an agent conversation, its workspace, and its saved harness settings.
A project session uses the same reservation, native launch, and Git worktree functions as a ticket agent.
The worktree lives under `agents/<run id>/work` in the data home and starts from the configured repository HEAD.
A session without a project uses `sessions/<name>`, a Git repository on `main` with one empty commit.
The session name contains lowercase letters, digits, and dashes, at most 40 characters.
An omitted name takes a generated `<adjective>-<noun>`. A taken name gets a numeric suffix.
The `sessions` row keeps the name, directory, harness, and run. The run holds the project, conversation, and process attempts.
The launch accepts a harness, model, effort, account, prompt, and files. A project session receives the prompt that the person entered.
Files live under `agents/<run id>/attachments/<content hash>/`. The agent receives their absolute paths.
A create request ID binds to the project, launch settings, prompt, and file bytes. A repeated request returns the same session.
`sessions.start` resumes a confirmed conversation with the saved harness settings and workspace.
When the previous process has no confirmed conversation, it starts from the original prompt in the same workspace.
Concurrent start and delete requests cannot change the same session. An unconfirmed process blocks a new start or deletion.
A compatible desktop restart preserves a session agent. After a protocol change, the user can start a stopped session again.
`sessions.delete` confirms process exit and removes the directory before it deletes the row. The run retains its output as history.
Project Sessions lists session, ticket, and flow runs. A ticket row uses its identifier, and its terminal header uses the ticket title.
The ticket Agent tab and session pages share the terminal and process controls.
The terminal header of a ticket run opens the ticket page in a sheet over the session. The sheet renders the same page as `/t/<identifier>`.
A pull request in that sheet opens its review in a second, wider sheet. Escape and an outside click close only the top sheet.

### Harness accounts

The Usage page stores several accounts per harness at `/usage`.
An account names an existing profile directory or a managed profile under `accounts/<id>/profile` in the data home.
Each managed profile keeps separate credentials. Shared directories retain sessions and skills. The provider CLI owns sign-in and token renewal.
Claude uses `CLAUDE_CONFIG_DIR`; Codex uses `CODEX_HOME`; Pi uses `PI_CODING_AGENT_DIR`; OpenCode uses `XDG_DATA_HOME`; Muse uses one directory as `XDG_CONFIG_HOME` and `XDG_DATA_HOME`, so `muse/auth.json` and `muse/sessions` sit under the profile.
Removal archives the account record and retains its files.

`harnessAccounts.list` returns account metadata, login commands, and capabilities. Account mutation requires a human actor.
`harnessAccounts.quota` reads subscription usage outside database transactions and caches results for 30 seconds.
A manual refresh has a one-second minimum interval. OpenCode and Pi return `unavailable` because they expose no quota endpoint.
Muse returns `signed_out` for a profile without `muse/auth.json`, unless a saved quota error has an active exhausted window.
Muse announces its subscription windows to its session client after each model call. The Muse bridge saves the latest announcement to `muse/trellis-usage.json`.
The bridge saves the reset time from a subscription quota error to `muse/trellis-quota.json`.
The bridge serializes writes across processes and keeps the newest observation in each file.
The separate quota file keeps a late usage announcement from removing an active error. An active exhausted window reads `ok` at 100 percent.
A normal snapshot with a later observation time supersedes an older quota error.
Trellis accepts a Muse observation for 60 seconds. An older observation returns `unavailable` without its windows.
Before the first run, or after every saved window has reset, the account is `unavailable` with a sentence that asks for a run.
An unavailable quota result contains no allowance estimate. Credentials stay on the host and do not enter API responses.

### Usage

The Usage page at `/usage` shows what every agent on the machine consumed.
`usage.report` reads the transcript files that each harness CLI writes: `projects/` of a Claude profile, `sessions/` of a Codex or Pi profile, `opencode/storage/` of an OpenCode data home, and `muse/sessions/` of a Muse data home, the default XDG data home or a Muse account profile.
The scan covers the default profile of each harness and the profile of every account, resolved to real paths, so a shared directory counts once.
The scan runs in the `prepare` step, outside every database transaction. A child worker parses the transcripts and builds the report. Database calls continue during the scan. The server caches each range for five minutes. A refresh uses a cached result for ten seconds.
Every turn uses the rate in `services/usage/pricing.ts`. A harness that records its own cost, such as Pi or OpenCode, keeps that cost. Muse Spark and Muse Glimmer cost $1.25 per million input tokens and $4.25 per million output tokens. Cached Muse input uses the input rate. A model outside the table takes the cheapest rate of its harness and marks the row approximate.
A session joins the agent run whose `session_id` it carries. A session whose cwd is inside `agents/<run id>/work` joins that run. A session whose cwd is inside a project directory joins that project. Every other session is outside Trellis.
The report holds the day series by harness, the totals, and separate cost and token rankings. Each ranking holds one row list per grouping (ticket, agent, project, kind, account, model, harness) and the top 200 sessions with one key per grouping.
`usage.accounts` lists every configured account and the default login of each harness that no account names, each with its quota. A Codex account with no standard quota windows is `unlimited`. An API key is `metered`. A login with no quota endpoint or no usable quota data is `unavailable`. The default Muse login comes from `muse/auth.json` under the XDG config home, and a Muse account profile holds its own `muse/auth.json`. Its windows come from the normal usage and quota files that Muse agent runs save. The page joins each login to its value through the account grouping of the selected ranking.
The page keeps the range, the metric, the grouping, the selected row, and the selected day in the URL.

The default login of a harness resolves the way SuperSet resolves it. SuperSet keeps one pointer file per harness under `~/.superset/state/`: `default-claude-config-dir` and `default-codex-home`, each with the profile directory of the default, or nothing for the plain login. When the file exists it wins. Otherwise the account with the Trellis default flag wins. Otherwise the plain login of the harness is the default. A pointer whose directory is gone counts as the plain login. A default picked in Settings also writes the pointer, so both tools agree. A run with no account reads the pointer again at every launch, and a profile exported in the login shell wins over the pointer.

`agentRuns.start` accepts an optional `accountId`. A new assignment otherwise selects its harness default account.
The assignment retains its account across process restarts. An explicit account also selects its harness for a new assignment.
`agentRuns.resume` requires the stopped attempt identifier and a stable request identifier.
A resume retains the assignment, workspace, and provider conversation. Its target account must use the same harness.
Claude, Codex, and Pi transfer the selected session file. Muse copies the session directory. OpenCode exports and imports that session through its CLI.
The runtime checks the resumed provider session identifier before it accepts the process.
### Agent observations

Codex compaction start, provider progress, and completion update the `contextCompaction` tool record.
The bridge forwards compaction progress from the engine log only for its current thread and turn.
Provider confirmation waits reset their timeout on fresh tool or assistant-message progress.

`trellis_agentRuns_session` returns activity details by default.
Its optional `include` list accepts `model`, `tool`, `lastTool`, `lastMessage`, `result`, `error`, and `process`.
The tool fields include stored input and output. The `process` field includes process, attempt, session, and turn identifiers.
For example, `{"id":"<runId>","include":["lastTool","error"]}` retrieves the latest tool record and agent error.

The runtime restores tool records, messages, and native turn activity from its event journal after a restart.
Codex, Pi, and OpenCode report completed assistant messages during a turn.
Claude reads the latest assistant text and timestamp from its transcript at tool and stop hooks.

`isWorking` is true when a controllable live process reports a working turn. It is false for ready or idle turns and exited processes.
Missing processes, unknown process status, lost process control, and unobserved turn activity produce a null work state.
Harness events establish turn activity. Terminal output alone does not establish active work, and a working turn does not prove progress.

A host interruption changes an unfinished send to `unknown`.
A durable receipt can confirm the original delivery. An explicit resend uses a new generation and message identifier.

The web Needs you page lists each ticket whose turn is `you` across every project.
`packages/api/src/turn/turn.ts` defines this turn from the status, pull requests, and the assigned run.
The Mentioned section lists comments that name the current human actor outside code.
A resolved comment or thread removes its mentions. A Done transition clears comments created before that transition, even if the ticket reopens.
Comments created after that transition remain eligible, including comments on Done tickets. Canceled transitions do not clear mentions.
A mention opens its thread on the ticket page.
Each person can snooze or ignore individual items. The database stores these choices in `needs_you_states`.
A new comment or a new review cycle creates a separate item. Completed work leaves all inbox views.
The default order is highest priority, then oldest ticket. Other orders use age, update time, or title.
The server sorts before pagination and uses the item ID to break ties. The URL stores the selected order and view.
The sidebar dot marks active items. Server events, snooze expiry, and window focus refresh the inbox.
The command palette accepts `Snooze TR-123 1d` and natural dates, with an exact date preview before confirmation.
Suffix `m` means minutes; prefix `m` means months. Past times require a future date.

### Flows

A flow is a graph of agent steps that trellis runs against a target, such as a
pull request. Flows are local records shared across projects. The Flows link of
the sidebar opens the Flows page at `/ai/flows`, and each flow opens in a canvas
editor at `/ai/flows/<slug>`. The slug comes from the name at create time, and
a collision takes the next free suffix: `review`, `review-2`.

A node is one step. An `agent` node runs one agent. A `gate` runs one agent that
answers YES or NO. A `human` node waits for a person. A `group` and a `loop`
are boxes that hold other nodes. A group has a `parallel` switch and optional
`minutes`. A loop runs its nodes again up to its round limit. An agent, a gate, and a loop
take an instruction. A human node also takes an instruction. The
`x` and `y` of a node inside a box are relative to that box.

An edge connects an output of one node to another node. A gate has the outputs
`yes` and `no`, and every other kind has `out`. An edge connects two nodes in
the same box, or two nodes outside every box. The edges of a flow form no loop.
`validateFlowGraph` in `packages/api/src/flowGraph.ts` holds these rules. The
server applies its structural rules before a save. The editor also shows
missing instructions, blank titles, and disconnected group steps as draft issues.

Each connectable card and box has handles on its four sides. Children of
parallel groups hide their handles. A wire starts or ends on any visible handle. The canvas draws each wire between the two sides of its
nodes that face each other, so an edge row stores no side. A gate starts a wire
only from its YES and NO handles. A new step connects from the step before it:
the selected step, or else the newest step of the same box. A gate connects the
new step by YES. The Clean up button lays out each box and then the canvas from
top to bottom with dagre, and its toast offers Undo. A connected group needs
one starting step, with edges that reach every other child. A new group contains one agent step. A wire into a connected group draws
to its starting step. A wire out draws from its last step when it has one.
A parallel group connects only at its boundary. Its children have no edges
between them. The Parallel switch removes edges between direct children.
A group can set a time limit or leave the time limit off. The zoom, fit, and Clean up controls sit
together at the bottom left of the canvas.

`flows.save` replaces every node and edge of a flow in one transaction. The
client mints the ULID of each new node and edge. `version` rises on every change
to a flow, and a save or an update with an older `expectedVersion` fails with
`FLOW_VERSION_CONFLICT`. The editor saves drafts 600 ms after the last change, including
unfinished instructions and disconnected steps. Structural errors still block
a server save. Each browser tab keeps its pending draft in local storage,
with the server version it edits. A reload or a return to the editor restores
that draft. A completed save clears only the draft that it confirms. Edits
made during the request keep the returned version for the next save.
The topbar shows the save status and the count of draft issues. A conflict
keeps the browser draft. A reload of the server graph requires explicit
confirmation to discard that draft.

The Flows tab of a ticket lists the runs of the ticket, newest first. A live
run and the newest run open with their steps; an older run opens on its name.
`FlowRunSummary` shows the flow name and version, the state, the start, the
duration, and the fact to act on: the step that failed, the step that waits,
or the reason of a cancel. `FlowRunTree` draws the steps as a tree in run
order, with every node of the saved graph: a step of a box that never started
shows as not started, a box row collapses its children, a running box shows
its time left, and a finished step shows its duration from `startedAt` to
`endedAt`. A row opens its terminal, copies its output or error, or takes a
human decision. A finished run can run again at the current flow version.
A failed child fails its box with the same error, and the run stops there.
When the runtime stops a worker at a box time limit, the step records the box
and its limit. The step prompt names the limit and the time left, and the
worker gets a message at half of the budget and again at a quarter. The
list refreshes on `flows.changed`. Every flow agent reads
the ticket, its description, and its linked pull requests right after the
briefing, so no step spends its budget on finding the target.

## Web routes

The routes are TanStack Router file routes under `apps/web/src/routes/`.

| route | file | page |
|---|---|---|
| `/` | `index.tsx` | a replace redirect to `/needs-you` |
| `/needs-you` | `needs-you/route.tsx` | human review tickets and personal mentions across every project |
| `/p/$` | `p/$/route.tsx` | a project as a board, a table, its diffs, its settings, its notes, its epics, or one epic |
| `/t/$identifier` | `t/$identifier/route.tsx` | one ticket |
| `/sessions/project/$project` | `sessions.project.$project.tsx` | project sessions and ticket agents in a secondary sidebar |
| `/sessions/$id` | `sessions.$id.tsx` | one session: the terminal of its agent and the process controls |
| `/search` | `search.tsx` | search |
| `/ai/flows` | `ai.flows.tsx` | the flows |
| `/ai/flows/$slug` | `ai.flows_.$slug.tsx` | one flow in the canvas editor |
| `/settings` | `settings.tsx` | the settings |
| `/setup` | `setup.tsx` | the first visit, and the new project step |
| `/_gallery` | `[_]gallery.tsx` | every primitive in every state, in both themes |

Ticket links open `/t/$identifier`. The header shows the project name and ticket
identifier, with the actions on the right. The content sits in fully rounded
cards below the header.
Every page card has a gap from the sidebar, the right edge, and the bottom edge.
The gap is 12 px on desktop and 8 px on a phone. Back restores the previous
router entry, including its filters, tab, and hash. Ticket, review, and usage
tabs each create a history entry. A ticket opens a pull request on its review route.
Escape closes the active control or clears the selection first, then goes back.
The terminal passes Escape to page navigation and keeps modified keys as terminal input.
A direct entry with no previous app page returns to Needs you with a replacement
entry. Back at the initial Needs you or setup page leaves the page in place.

`/p/$` takes one splat, `[key, ...slugs, view?]`. The URL keeps slashes and the
API ref joins the same segments with dots, so `/p/CDE/web/auth` reads
`CDE.web.auth`. The last segment is a view only when it is a reserved slug:
`table`, `settings`, `notes`, `diffs`, `epics`, or `board`. The last two
segments `epics/<slug>` open one epic when a project segment precedes them;
`/p/EPICS/<sub>` is a sub-project of the root `EPICS`. `SlugSchema` refuses `board`,
`settings`, `notes`, `diffs`, and `epics`, and a `CHECK` on `projects.slug`
refuses `board` and `settings`, so a sub-project never takes one of those
names.

The board uses the bare project URL. An older link
that ends in `/board` redirects to the same path with the segment dropped.

A card in a status with the human reviewer shows up to five linked PR approval marks.
An overflow pill opens a tooltip that lists every linked PR and its approval state.

The URL carries the whole view state in the shared filter grammar, with no
default written. `beforeLoad` redirects a non-canonical search string to its
canonical spelling, so one view has one URL.

A settings page keeps its section in the URL hash and shows one section at a
time. The first section of each page carries no hash.

| page | sections |
|---|---|
| `/settings` | Account (no hash), `#desktop` in the macOS app |
| `/p/<path>/settings` | General (no hash), `#notes`, `#template`, `#statuses`, `#labels`, `#archive` |

`/settings` holds the actor name, theme, and desktop controls.
Project settings hold the repository directory and repository selection.
They write `projects.directory` and the project repositories.

The sidebar holds the workspace row, Needs you, Search, Flows, Usage,
the sessions, the project tree, and the actor footer.
The sessions and the project tree share the one region that scrolls, so the fixed
links keep their place at any height.
The global Sessions section lists sessions without a project. Its New session button opens a dialog with project, harness, model, effort, and account choices.
The dialog accepts a prompt, files, and an optional name. A project also has a Sessions page with a secondary sidebar for all its agents.
Session creation commits the session and its attempt before workspace preparation and agent startup.
The response opens the session view and closes the dialog while a tracked background task completes the launch.
The session view shows startup progress until the runtime reports a process, then attaches its terminal.
The host publishes launch results after the request ends and waits for background tasks before database shutdown.
Repository initialization runs outside the database transaction. An idempotent request reuses its reserved session and attempt.
After a host crash, an unconfirmed attempt requires process inspection before another launch.
Unsent text and files stay available when the user changes sessions.
Each session row opens its conversation. The conversation controls can stop, resume, or delete the session.
Each project row shows the Trellis mark and project name. Tickets, Epics, Diffs, and Sessions appear below it.
The Epics row prints `openEpicCount` when it is above zero. The Tickets row is off on the epics pages.
The row menu of a project opens its Settings page.
The Diffs page at `/p/<path>/diffs` lists the pull requests of the project: the ones linked to a ticket of the
project or one of its sub-projects, and the ones kept for a review in a repository of the project or one of its
ancestors. Its second source lists the open pull requests of the signed-in GitHub user in those repositories.
The selected state follows the current page for root, nested, and archived projects.
The Epics page at `/p/<path>/epics` lists the epics of the project and its sub-projects in two groups, Open and
Done, each with its count. A row prints the name, a `StackedBar` of the counts by category, `done/total`, the
updated time, and a row menu. The rows use the row heights, the hover band, and the cell text sizes of the
ticket table `Row`.
`/p/<path>/epics/<slug>` shows one epic. Its `Topbar` holds the breadcrumb, the `FilterBar` chips, the Display
`IconButton`, the Add tickets `IconButton`, and the `Menu` with Edit and Delete. The page fixes the `epic`
filter through the `fixed` prop of the `FilterBar`: the bar draws no epic chip, the filter picker offers no
Epic field and lists the waves of this epic alone, and Copy as CLI writes `--epic`. The table reads the
root project with its sub-projects (`scope` default `subprojects`), because an epic holds tickets of any
project of its root. Every link to the page writes its query through `epicQueryString`, so `group=status` and
`scope=self` stay in the URL. Add tickets opens the `TicketPicker` of the project and
writes `tickets.updateMany { epic }`.
A header band below the `Topbar` prints the state `Badge`, `<done> of <total - canceled> done`, the `StackedBar`
of the epic with its legend, and one `StackedBar` line per wave in position order with its name and
`done/total`.
The `SectionHeader` Plan holds the description in the ticket markdown renderer, with a Show or Hide action. The
section starts collapsed when the description is longer than 1200 characters, and `uiStore` keeps the collapsed
state under the key `<route key>#plan`. The band and the plan take at most half of the page card and scroll
inside it.
The tickets show in the full-width `TicketTable` of the project table view. Its search is the URL search with
`epic` fixed to the epic ref and `group` default `wave` (`epicSearch.ts`). The URL carries `sort`,
`density`, `columns`, and the filters, as the project table does. The URL never carries `epic`, it omits
`group=wave`, and it writes `group=status`. The row actions, the bulk bar, and the keyboard navigation are the ones of
the table. The bulk bar Set epic with None, and the Epic row of the ticket rail, take a ticket out of the epic.
The Edit sheet of an epic holds a Waves section: each wave has a name field, a move up, a move down,
and a delete `IconButton`, and a New wave field with an Add wave `Button` follows the list. The section writes through
`waves.create`, `waves.update`, `waves.reorder`, and `waves.delete`.
The ticket filters take `wave`, the table groups by Wave in position order with No wave last,
and the table has a Wave column that is hidden by default. The bulk bar offers Set wave with the
waves of the one epic that every selected ticket belongs to, and the control is off without that epic. The
ticket rail shows a Wave row after Epic when the ticket has an
epic.

## Database schema

The schema lives in `apps/server/src/db/schema.ts` and
`apps/server/src/db/tables/`. Ids are ULIDs in `text` columns, except
`activity.id`. Timestamps are `timestamptz` with millisecond precision, and ISO
strings on the wire. An enum-like column is `text` with a named `CHECK`, because
a Postgres enum cannot be altered inside the single-transaction migrator. There
are no triggers. Every rule is a constraint or a service function that takes
`tx`.

| table | columns and constraints |
|---|---|
| projects | id PK, parent_id, root_id, key (UNIQUE, CHECK regex), slug (CHECK slug regex, not `board` or `settings`), name (1 to 120), description, directory, ticket_template, ticket_counter, position, archived_at, created_at, updated_at. UNIQUE (id, root_id). FK (parent_id, root_id). UNIQUE NULLS NOT DISTINCT (parent_id, slug). CHECK `(parent_id IS NULL) = (root_id = id)`, `(parent_id IS NULL) = (key IS NOT NULL)`, `parent_id <> id`, `parent_id IS NULL OR ticket_counter = 0`. Index (root_id). |
| repos | id PK, project_id (CASCADE), owner, repo (both CHECK lowercase). UNIQUE (project_id, owner, repo). The effective repos of a project are its own plus those of its ancestors. |
| statuses | id PK, project_id (CASCADE), name (1 to 40), description (CHECK <= 2000), slug, category (CHECK set), reviewer (CHECK `(category = 'review') = (reviewer IS NOT NULL)`), color, position, is_default, created_at, updated_at. UNIQUE (project_id, name) and (project_id, slug). Partial UNIQUE (project_id) WHERE is_default. |
| label_groups | id PK, project_id (CASCADE, the root of the tree), name, created_at, updated_at. UNIQUE (project_id, lower(name)). CHECK name trimmed, 1 to 80, no `,`, no `/`, and not `none`. |
| labels | id PK, project_id (CASCADE, the root of the tree), group_id (FK label_groups CASCADE, NULL for a label with no group), name, color (CHECK set), description (CHECK <= 255, default `''`), created_at, updated_at. Partial UNIQUE (group_id, lower(name)) WHERE group_id IS NOT NULL and (project_id, lower(name)) WHERE group_id IS NULL. The same name CHECK as label_groups. Index (project_id). |
| ticket_labels | ticket_id (CASCADE), label_id (CASCADE), created_at. PK (ticket_id, label_id). Index (label_id). |
| tickets | id PK, project_id, root_id, number (CHECK > 0), title (CHECK trimmed, 1 to 500), description, priority (CHECK set), status_id (FK statuses RESTRICT), parent_id, epic_id (FK epics SET NULL), wave_id (FK waves SET NULL; CHECK `tickets_wave_needs_epic`: a row with a wave has an epic), position double, version, started_at, completed_at, search tsvector GENERATED (title A, description B), created_at, updated_at. UNIQUE (root_id, number) and (id, root_id). FK (project_id, root_id) RESTRICT and FK (parent_id, root_id) RESTRICT. Indexes (project_id, status_id, position), (status_id, position, id, project_id, root_id), (parent_id), (epic_id), (wave_id), partial (root_id, updated_at DESC) WHERE completed_at IS NULL, partial (root_id, completed_at DESC) WHERE completed_at IS NOT NULL, GIN (search), GIN (title gin_trgm_ops). |
| epics | id PK, project_id (CASCADE), root_id, slug (CHECK slug regex), name (CHECK trimmed, 1 to 120), description (CHECK <= 200000), actor_name, actor_kind, created_at, updated_at. FK to actors. UNIQUE (id, root_id) and (root_id, slug). FK (project_id, root_id) CASCADE, so an epic stays in the root of its project. Index (project_id). The state of an epic is never stored. |
| waves | id PK, epic_id (CASCADE), root_id, slug (CHECK slug regex), name (CHECK trimmed, 1 to 120), position integer (CHECK >= 0), created_at, updated_at. UNIQUE (id, epic_id) and (epic_id, slug). FK (epic_id, root_id) CASCADE, so a wave stays in the root of its epic. Index (epic_id, position). The state of a wave is never stored. |
| comments | id PK, ticket_id (CASCADE), body (1 to 200000), parent_id, resolved_at, actor_name, actor_kind, search tsvector GENERATED (body C), created_at, updated_at. FK to actors. UNIQUE (id, ticket_id). FK (parent_id, ticket_id) CASCADE, so a reply stays on the ticket of its root. CHECK `parent_id <> id` and `parent_id IS NULL OR resolved_at IS NULL`, so only a root carries the resolved mark. Index (ticket_id, created_at) and (parent_id). GIN (search). |
| attachments | id PK, ticket_id (CASCADE), filename (1 to 255, no `/`), mime, size (CHECK > 0), sha256 (CHECK hex 64), actor_name, actor_kind, created_at. FK to actors. Index (ticket_id) and (sha256). |
| pull_requests | id PK, owner, repo (CHECK lowercase), number (CHECK > 0), url, title, state, is_draft, is_queued, head_ref, base_ref, review_state, merged_at, closed_at, checks jsonb (CHECK array), ci_state, content_hash, fetched_at, fetch_error, created_at, updated_at. UNIQUE (owner, repo, number). Index (state, ci_state). |
| ticket_pull_requests | ticket_id (CASCADE), pull_request_id (CASCADE), source (manual), actor_name, actor_kind, created_at. PK (ticket_id, pull_request_id). Index (pull_request_id). |
| activity | id bigint IDENTITY PK, batch_id, root_id (CASCADE), project_id (CASCADE), ticket_id (CASCADE), actor_name, actor_kind, action, field, from_value, to_value, meta jsonb, created_at. FK to actors. CHECK `field <> 'description' OR (from_value IS NULL AND to_value IS NULL)`. Indexes (ticket_id, id), (ticket_id, created_at DESC, id DESC), (root_id, id), (project_id, id), (created_at). |
| actors | name (CHECK 1 to 64, no `:`), kind (human, agent, or system), first_seen_at, last_seen_at. PK (name, kind). |
| settings | key PK, value jsonb, updated_at. |
| flows | id PK, slug (UNIQUE, CHECK slug regex, 64 at most), name (1 to 120), description (CHECK <= 2000), briefing (CHECK <= 200000), harness (jsonb, NULL means claude), version (CHECK > 0), created_at, updated_at. |
| flow_nodes | id PK, flow_id (CASCADE), parent_id, kind (CHECK agent, gate, human, group, or loop), title (0 to 120), instruction (CHECK <= 200000), parallel (boolean, group only), minutes (optional, group only, 1 to 1440), harness (jsonb, agent, gate, or loop only; NULL takes the flow's), max_rounds (CHECK `(kind = 'loop') = (max_rounds IS NOT NULL)`, 1 to 50), x, y, width, height (CHECK >= 40). UNIQUE (id, flow_id). FK (parent_id, flow_id) CASCADE, so a group and the nodes inside it stay in one flow. Index (flow_id). |
| flow_edges | id PK, flow_id (CASCADE), from_node_id, to_node_id, branch (CHECK out, yes, or no). FK (from_node_id, flow_id) and FK (to_node_id, flow_id) to flow_nodes CASCADE. UNIQUE (from_node_id, branch, to_node_id). CHECK `from_node_id <> to_node_id`. Indexes (flow_id) and (to_node_id). |
| harness_accounts | id PK, name, harness, profile_path, is_default, archived_at, created_at, updated_at. Partial UNIQUE (harness, profile_path) for current accounts. Partial UNIQUE (harness) for current default accounts. |
| agent_runs | id PK, name, account_id (FK harness_accounts), runtime (default `native`), harness jsonb, kind (CHECK agent, flow, or session), instruction, project_id (SET NULL), project_path, ticket_id (SET NULL), ticket_identifier, closed_at, workspace_id, terminal_id, url, error, session_id, session_lost (default false), created_at, updated_at. Partial UNIQUE (ticket_id) WHERE `kind = 'agent'` and `closed_at IS NULL`. Index (created_at). |
| sessions | id PK, name (UNIQUE, CHECK lowercase letters, digits, and dashes, 1 to 40), directory, harness jsonb, run_id (UNIQUE, FK agent_runs), created_at, updated_at. The run has the kind `session`, an optional project, and no ticket. |

The `id` column of `activity` is the cursor and the sort key of every activity
feed. A description row carries `meta.deltaChars` and no text. A status row
carries `fromId`, `toId`, `fromCategory`, and `toCategory` in `meta`. Every
mutating transaction upserts its actor first, and a worker cache flushes
`last_seen_at` every 30 seconds.

Numbering runs in one transaction. The server raises `ticket_counter` on the
root with `UPDATE ... RETURNING`, then inserts the ticket. A test asserts that 50
concurrent creates give 50 consecutive numbers.

The kanban position of a new card is the maximum plus 1024. A move takes the
midpoint of its neighbors. The column renumbers in steps of 1024 when the gap
falls below 1. A list sorts and pages by `(position, id)`.

The schema migrations live in `apps/server/drizzle/`, through `0078_kind_jetstream`.
`meta/_journal.json` defines their order. Applied migrations preserve upgrades for existing data homes.
The migrator applies schema changes at boot in one transaction, then runs `ANALYZE` and sets `pg_trgm.word_similarity_threshold`.
The schema drift check requires `drizzle-kit generate` to leave the migration directory unchanged.

PGlite has no autovacuum. A maintenance timer runs `VACUUM (ANALYZE)` on
tickets, activity, and comments after more than 1000 writes, and after a backup
or a restore.

## API contract and ref grammars

The contract lives in `packages/api/src/contract/`. Two handlers serve one
router: `RPCHandler` at `/rpc` for typed clients, and `OpenAPIHandler` at `/api`
for curl and agents. Scalar renders the spec at `/api/docs`, and the raw spec is
at `/api/openapi.json`. `ResponseHeadersPlugin` sets `Location` on a create and
`x-trellis-api-version` on every response.

A ref names a row without its ULID. Every grammar accepts any letter case and
returns one canonical spelling.

| ref | grammar | example |
|---|---|---|
| TicketRef | ULID or `KEY-n` | `CDE-42` |
| EpicRef | ULID or `KEY/slug` | `OP/routine-runtime` |
| WaveRef | ULID or `KEY/epic-slug/wave-slug` | `OP/routine-runtime/phase-1` |
| ProjectRef | ULID, `KEY`, or `KEY.slug(.slug)*` | `CDE.web.auth` |
| StatusRef | ULID, slug, name, or `category:<category>` | `in-progress`, `category:review` |
| LabelRef | ULID, `name`, or `group/name` | `bug`, `type/feature` |
| Actor header | `human:<name>` or `agent:<name>` | `agent:claude-code` |

| procedure | route | notes |
|---|---|---|
| projects.list | GET /api/projects | flat list with path, depth, open count, and open epic count |
| projects.get | GET /api/projects/{project} | ancestors, children, repos, effective statuses, ticket template |
| projects.create | POST /api/projects | 201 and `Location`; a root needs a key, a child rejects one |
| projects.update | PATCH /api/projects/{project} | name, slug, description, ticket template, archived |
| projects.move | POST /api/projects/{project}/move | parent, after, before |
| projects.delete | DELETE /api/projects/{project} | `force` deletes a non-empty subtree |
| projects.repos | GET /api/projects/{project}/repos | the repos of the project and of every project above it |
| projects.setRepos | PUT /api/projects/{project}/repos | full replace, idempotent |
| statuses.list, create, update, reorder | GET, POST /api/projects/{project}/statuses; PATCH .../{status}; PUT .../order | the category is immutable |
| statuses.delete | DELETE /api/projects/{project}/statuses/{status} | `moveTo` moves the tickets first |
| statuses.clear | DELETE /api/projects/{project}/statuses | sub-projects only |
| labels.list | GET /api/projects/{project}/labels | the groups and the labels of the tree, each in name order; every label carries its ticket count |
| labels.create, update, delete | POST /api/projects/{project}/labels; PATCH, DELETE .../{label} | `{label}` is the label ULID; a body names a group by ULID or by name |
| labelGroups.create, update, delete | POST /api/projects/{project}/label-groups; PATCH, DELETE .../{group} | delete takes `labels=ungroup` or `labels=delete` |
| tickets.list | GET /api/tickets | the shared filter grammar; `{items, nextCursor}` and no total |
| tickets.counts | GET /api/tickets/counts | the same filters; `{total, byStatus}` |
| tickets.board | GET /api/tickets/board | one query; each column carries a count and its first 100 cards |
| tickets.get | GET /api/tickets/{ticket} | the full ticket with project, status, parent, children, prs, attachments |
| tickets.create | POST /api/tickets | 201 and `Location`; `epic` joins an epic of the same root; `wave` joins a wave and its epic |
| tickets.update | PATCH /api/tickets/{ticket} | `If-Match` maps to `expectedVersion`; `epic: null` clears the epic and the wave; `wave: null` clears the wave |
| tickets.move | POST /api/tickets/{ticket}/move | status, after, before; an anchor must be in the target column |
| tickets.updateMany, deleteMany | POST /api/tickets/update-many, delete-many | up to 200 refs in one transaction; `epic` and `wave` follow the rules of `tickets.update` per ticket; two refs with the same canonical spelling are refused, and a ULID and a `KEY-n` of one ticket are two spellings |
| tickets.delete | DELETE /api/tickets/{ticket} | `force` overrides the agent policy |
| epics.list | GET /api/epics?project=KEY | the epics of the project and its sub-projects; open first, then done, then by updated desc |
| epics.get | GET /api/epics/{epic} | the summary, its waves in position order, and its tickets in number order; `{epic}` takes `KEY/slug` with its slash |
| epics.create | POST /api/epics | 201 and `Location`; `slug` derives from `name` when absent |
| epics.update | PATCH /api/epics/{epic} | name, slug, description |
| epics.delete | DELETE /api/epics/{epic} | `{id}`; detaches its tickets; `force` overrides the agent policy |
| waves.create | POST /api/waves | body `{epic, name, slug?}`; 201 and no `Location`; the wave takes the last position; `slug` derives from `name` when absent |
| waves.update | PATCH /api/waves/{wave} | name, slug; `{wave}` takes `KEY/epic-slug/wave-slug` with its slashes |
| waves.reorder | PUT /api/waves/order | body `{epic, waves}`, every wave of the epic once in the new order; answers the list |
| waves.delete | DELETE /api/waves/{wave} | `{id}`; detaches its tickets; `force` overrides the agent policy |
| timeline.list | GET /api/tickets/{ticket}/timeline | comments and activity merged, newest first |
| comments.create, update, delete | POST /api/tickets/{ticket}/comments; PATCH, DELETE /api/comments/{id} | a create with `parentId` joins that thread |
| comments.thread, resolve | GET /api/comments/{id}/thread; POST /api/comments/{id}/resolve | the root comment and every reply; resolve takes the reopen too |
| attachments.list, upload, get, delete | GET, POST /api/tickets/{ticket}/attachments; GET, DELETE /api/attachments/{id} | the bytes come from GET /api/attachments/{id}/file |
| pullRequests.list, link, unlink, refresh | GET, POST /api/tickets/{ticket}/prs; DELETE /api/tickets/{ticket}/prs/{id}; POST /api/prs/{id}/refresh | a link is idempotent |
| pullRequests.diff | GET /api/prs/{id}/diff | `gh pr diff`, cut at 1 MB, cached for 60 s |
| flows.list, get, create, update, save, delete | GET, POST /api/flows; GET, PATCH, DELETE /api/flows/{flow}; PUT /api/flows/{flow}/graph | `{flow}` is a ULID or a slug; save replaces every node and edge |
| agentRuns.list, start | GET and POST /api/agent-runs | start answers 201 with the row in any state |
| agentRuns.stop, refresh, send | POST /api/agent-runs/{id}/stop, /refresh, /send | send takes 1 to 20000 characters |
| agentRuns.resume | POST /api/agent-runs/{id}/resume | existing assignment, accountId, expectedTerminalId, requestId |
| harnessAccounts.list, create, update, remove | GET, POST /api/harness-accounts; PATCH, DELETE /api/harness-accounts/{id} | account metadata and profile selection |
| harnessAccounts.quota | GET /api/harness-accounts/{id}/quota | cached usage windows and reset times |
| usage.report | GET /api/usage | token cost from the harness transcripts, joined to runs, tickets, projects, and accounts; cached for five minutes |
| usage.accounts | GET /api/usage/accounts | every configured account and each default login with its subscription quota; cached for five minutes |
| agentRuns.output | GET /api/agent-runs/{id}/output | the terminal text as `{text}` |
| sessions.list, get | GET /api/sessions, /api/sessions/{id} | newest first; get carries the observed run |
| sessions.create | POST /api/sessions | 201 and `Location`; a prompt or files, optional project, name, harness, account, and request ID |
| sessions.start | POST /api/sessions/{id}/start | resumes the saved conversation, or starts again from the prompt |
| sessions.delete | DELETE /api/sessions/{id} | stops the agent and removes the directory; the run stays as history |
| search.query | GET /api/search | tickets and projects |
| brief.get | GET /api/tickets/{ticket}/brief | the markdown brief an agent starts from |
| actors.list, default | GET /api/actors, /api/actors/default | |
| settings.get, set | GET, PUT /api/settings | |
| system.health, gh, checkGh, backup | GET /api/health, /api/gh; POST /api/gh/check, /api/backup | gh and checkGh run in the HTTP process, not the database worker |
| system.chooseDirectory | POST /api/choose-directory | it opens the folder picker of the server computer |
| export | GET /api/export | a Hono route, not a contract procedure: an NDJSON stream with `Content-Disposition: attachment` |

`TicketSummary` is the shape that list, board, and events carry. It holds the
identifier, the title, the priority, the status, the project, the parent, the
epic link and the wave link (`id`, `ref`, `name` each), the child counts, the comment and attachment counts, the pull request rollup, the
approval state of each linked pull request, the last actor, the position, the
version, and the timestamps. Only `tickets.get` returns the description.

The filter grammar is identical in the API, the web URL, and the CLI flags.

| param | values |
|---|---|
| project | a ProjectRef; `subprojects=false` narrows to that project |
| status | a list of StatusRef |
| category | a list of todo, started, review, done, canceled |
| reviewer | human or agent |
| priority | a list |
| parent | a TicketRef or `none` |
| waitsOn | a TicketRef; keeps tickets with that dependency edge |
| blocked | true or false; tests for an open dependency |
| epic | an EpicRef or `none` |
| wave | a WaveRef or `none` |
| label | a list of LabelRef; a ticket that holds one of them stays; `none` in the list keeps a ticket with no label |
| labelNot | a list of LabelRef; a ticket that holds one of them drops out |
| pr | any, none, open, draft, queued, merged, closed |
| ci | a list of pass, fail, pending, none |
| actor | `kind:name` or `name`, matched against the last actor |
| q | full text search with a prefix on the last token |
| updated, created, completed | ISO lower bounds |
| sort | `[-]updatedAt`, createdAt, priority, number, status, or position |
| cursor, limit | an opaque cursor bound to the filter hash; limit 1 to 200, default 50 |

One example on the three surfaces:

```
GET /api/tickets?project=CDE&status=in-progress,agent-review&parent=none&label=bug&ci=fail&sort=-updatedAt
/p/CDE?status=in-progress,agent-review&parent=none&label=bug&ci=fail&sort=-updatedAt
trellis list --project CDE --status in-progress,agent-review --parent none --label bug --ci fail --sort -updatedAt
```

The contract declares every error as `{defined, code, status, message, data}`.
The map lives in `packages/api/src/errors.ts`: INPUT_VALIDATION_FAILED 400,
ACTOR_REQUIRED 400, ACTOR_INVALID 400, INVALID_CURSOR 400, INVALID_PR_URL 400,
WAVE_OUTSIDE_EPIC 400,
AGENT_CANNOT_DELETE 403, NOT_FOUND 404, DUPLICATE
409, KEY_LOCKED 409, STATUS_NOT_IN_PROJECT 409, STATUS_IN_USE 409, LAST_STATUS
409, ROOT_STATUSES 409, STATUS_CATEGORY_IMMUTABLE 409, CROSS_ROOT_MOVE 409,
PARENT_CYCLE 409, PROJECT_NOT_EMPTY 409, PROJECT_ARCHIVED 409,
LABEL_AMBIGUOUS 409, LABEL_GROUP_CONFLICT 409,
COMMENT_PARENT_MISMATCH 409, COMMENT_HAS_REPLIES 409, INVALID_ANCHOR 409,
VERSION_CONFLICT 412, FLOW_VERSION_CONFLICT 412, PAYLOAD_TOO_LARGE 413,
GH_UNAVAILABLE 503, RUNNER_UNAVAILABLE 503.

The API carries no version prefix. `apiVersion` appears in health and in
`x-trellis-api-version`. Changes inside a version are additive. The CLI sends
`x-trellis-client: cli/<semver>` and exits 7 when the server is older than it.

## Live updates

An event id is `<bootId>.<seq>`. The server mints `bootId` as a ULID at boot and
starts the sequence at 0. The stream is
`GET /api/events?since=&types=&project=&ticket=`, and `Last-Event-ID` wins over
`since`.

On connect the server sends `reset {reason}` when the id came from another boot
(`restart`) or fell below the ring floor (`gap`), then
`ready {id, bootId, serverVersion, apiVersion}`. The ring buffer holds 1000
events. An idle stream sends `: ping` every 15 seconds, and the `ping` query
parameter changes that interval. A shutdown sends `bye {reason}`.

Payloads:
`ticket.created | updated | deleted {summary, fields, batchId}`,
`pr.linked | unlinked | updated {id, ticketIds, projectIds, state, ciState}`,
`comment.created | updated | deleted {id, ticketId, projectId, parentId, threadId, resolved}`,
`attachment.created | deleted {id, ticketId, projectId}`,
`statuses.changed {projectId}`, `labels.changed {projectId}`, `epics.changed {projectId, id}`,
`project.created | updated | deleted | moved {id}`, `gh.status {ok, reason}`,
`flows.changed {id}`, `agent-runs.changed {id}`, `sessions.changed {id}`, and `needs-you.changed {actorName}`.
`packages/api/src/events.ts` holds the one list of names, and the `types=`
parameter takes a name or a `prefix.*` form.

The client rule is patch first and invalidate rarely, in
`packages/api/src/query-keys.ts`. A `ticket.*` event patches every cached list,
board, search, and detail entry that holds the id. A patch applies per
entry only when `incoming.version > entry.version`, and then sets the entry
version. A queued or in-flight refetch never blocks a patch.

A detail entry whose event fields include `description` keeps its old text and
gains `descriptionStale`. The coalescer then invalidates it, and the refetch
clears the flag. The description editor refuses to save while the flag is set.
While a mutation for an id is in flight, patches queue and apply in version
order after it settles.

Invalidation happens only when membership or order can change: status, project,
priority, labels, parent, epic, wave, completed, create, and delete. It runs through a
coalescer with a 250 ms trailing delay and a 1 s maximum. A mutation writes its response with `setQueryData` and invalidates on an
error only. SSE-patched entities use `staleTime: Infinity`, and a `reset` or a
reconnect invalidates everything.

The web app opens one EventSource per origin. The tab that holds the
`trellis-sse` web lock owns it and rebroadcasts over `BroadcastChannel`. The
mobile app streams in the foreground only, and invalidates everything when it
returns to the foreground. `trellis watch` prints JSON lines and filters
server-side.

## PR and CI polling

The poller lives in `apps/server/src/gh/`. It runs one `gh api graphql` request
per 50 pull requests, with one alias per pull request. One tick spawns one
process, whatever the pull request count. `link` and `refresh` use the same
query for one pull request. The query includes `mergeQueueEntry`, and `is_queued`
records whether that entry exists. A row is written only when its content hash changes.

GitHub keeps a re-run beside the run it replaces. `normalizeChecks` therefore
keeps one node per name, workflow, and event, and takes the node that started
last, as `gh pr checks` does.

The tick runs every 10 seconds and picks the pull requests that are due. A pull
request with pending checks is due after 30 seconds. An open pull request
without pending checks is due after 120 seconds. A merged or closed pull request
is due after 10 minutes, and stops when the ticket is done or canceled.

The poller reads `gh api rate_limit` every 5 minutes. Below 20 percent
remaining it multiplies every interval by 4 and emits a `gh.status` event. The
gh runner shares 2 poller slots and 1 interactive slot for diff, refresh, and
link. When gh is missing or signed out, the poller rechecks every 60 seconds,
logs one line per state change, and shows a banner in the web app.

`deriveCiState(checks)` returns fail on any fail or cancel, else pending on any
pending, else pass on any pass, else none.

Tests drive `poller.tick()` against a stub gh script. `TRELLIS_GH_BIN` points at
the stub, `TRELLIS_GH_STUB_FILE` holds its replies, and the stub counts its
spawns.

## Attachments

An upload arrives as multipart through oRPC `z.file()`. The Hono `bodyLimit` is
50 MB, and `TRELLIS_MAX_UPLOAD_MB` changes it. The server hashes the stream with
`Bun.CryptoHasher` in 1 MB chunks while it writes `attachments/tmp/<ulid>`. It
then calls `finalize(sha)` under the blob lock, which renames or dedupes the
file and writes the database row.

`gc(sha)` runs under the same lock after a delete commits. A boot sweep runs
before the server accepts requests. It unlinks every file without a row and
empties `tmp/`. The blob path is a function of the hash:
`attachments/<sha[0:2]>/<sha>`. No row stores a path, so a data home that moves
still resolves every file.

`GET /api/attachments/{id}/file` serves the bytes with `Bun.file`. It sets the
recorded mime, `ETag: "<sha>"`, `Cache-Control: private, max-age=31536000,
immutable`, `X-Content-Type-Options: nosniff`, and
`Content-Security-Policy: sandbox`. Only this allowlist renders inline:
`image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/avif`,
`application/pdf`, `text/plain`, `text/markdown`, `video/mp4`, and `video/webm`.
Every other type, including SVG and HTML, downloads, because an inline SVG on
the app origin is stored cross-site scripting.

## Search

A `KEY-n` text reads the exact ticket first, then the full text hits of the same
text, in one statement. Any other text runs full text search over
`tickets.search` and `comments.search`, ranked by `ts_rank`. The tsquery matches
every leading token as a whole lexeme and the last token as a prefix.

The result unions with a trigram match on the title, ranked by
`word_similarity`, when the text is 3 characters or longer. Text hits sort
first, so the trigram index runs only when the text hits fill less than the
page. The query dedupes, limits to 20 rows, and runs under a 200 ms statement
timeout. The client debounces by 120 ms, keeps one search in flight, and drops a
superseded one on both sides.

## Performance design

The database worker keeps the synchronous WASM
execution of PGlite off the thread that serves HTTP, SSE, gh pipes, and uploads.
PGlite has one lock, so one slow transaction makes every other call wait. A
service runs gh only in its `prepare` step, before its transaction opens. The
context of a transaction has no gh runner, so a gh call there fails the
typecheck. `system.gh` and `system.checkGh` run in the HTTP process and never
reach the worker. The server logs `long transaction` with the service name
when a transaction holds the lock for 250 ms or more. Server-Timing and the
request log split the database time into `queue`, `lock`, and `db`.
A search request carries a client id, and a newer request drops a superseded one
before it runs. Lists carry `TicketSummary` and never the description. The board
and the counts replace a total and a large limit. Events patch first and carry a
version. The poller batches its GraphQL query. The indexes are trimmed and
partial. An in-memory cache holds the project tree.

## Code organization

Conventions shared by every workspace:

- One folder per module or component: `Name/Name.ts(x)`, `Name/index.ts`.
- Co-locate by usage. One user nests it under that user's `components/`. Two users promote it to the highest shared parent.
- One exported component or service per file. Split a file over 300 lines.
- Layers import downward only. A Biome `noRestrictedImports` rule enforces the arrows, and a violation fails `lint`.
- Names: `camelCase` files for modules, `PascalCase` folders for React components, `kebab-case` for routes and CLI commands.

`packages/api` holds the contract and no runtime dependency beyond zod and oRPC:
`refs.ts`, `errors.ts`, `events.ts`, `query-keys.ts`, `client.ts`, `pair.ts`,
`schemas/`, `contract/`, `agentLaunch/` (agent command variables),
`instructions.ts` (the `AGENTS.md` block).

`apps/server` holds `index.ts` (boot), `config.ts`, `log.ts`, `app.ts`,
`context.ts`, `db/` (worker, transport, client, migrate, schema, tables, enums,
tx, cache, maintenance, queries), `services/`, `procedures/`, `routes/`,
`events/bus.ts`, `gh/`, `agents/` (native launch, harness, controller, and flow execution), and `storage/blobs.ts`.

One mutation flows in one direction: `procedures/tickets.ts#move` calls
`services/tickets.ts#move(ctx, tx, input)` inside `withTx`, which calls the
queries, writes the activity rows, and queues the events. The transaction
commits, then `withTx` flushes the events to the bus, and the bus writes them to
every matching SSE stream.

The `tx`-first rule holds everywhere. Every query takes `(tx, input)` and every
service takes `(ctx, tx, input)`. Only `db/client.ts` and `db/tx.ts` hold a
module-level `db`. A nested query inside a PGlite transaction deadlocks the
server. A Biome import rule enforces the `tx`-first boundary.

Shutdown stops the listener, sends `bye` on every stream, drains the poller for
up to 5 seconds, closes the worker, and exits 0.

A backup runs `CHECKPOINT` in the worker and copies `db/` and `attachments/` to
`backups/snapshot-<stamp>` by reference. The worker therefore holds its queue
for the checkpoint and the copy only. The HTTP process then runs `tar` over the
snapshot into `trellis-<stamp>.tar.gz.partial`, renames the file when tar exits
0, and removes the snapshot. A failed backup removes both, and so does the next
boot. The data home keeps the 10 newest archives. `trellis export` streams
NDJSON per table in keyset pages of 1000 rows.

`apps/web` holds `routes/` (TanStack Router file routes), `features/` (agents,
attachments, board, command, composer, epics, filters, flows, navRows, needs-you,
notes, pickers, project-actions, project-settings, prs, reviews, search,
sessions, settings, setup, shell, sidebar, table, ticket, usage), `components/`,
`hooks/`, `lib/`, and `stores/`.

`apps/mobile` holds the expo-router `app/` tree and `src/` with `features/`,
`components/`, `lib/`, and `theme/tokens.ts`. A script generates
`theme/tokens.ts` from `packages/ui/src/tokens.css`. Nobody edits it by hand.
The app keeps the server URL, the actor name, the theme, and the query cache in
`expo-sqlite/kv-store`. Every dependency is in the bundled native module list of
the Expo SDK, so the app runs in Expo Go and needs no build step.

`packages/cli` holds `index.ts` (the citty root), `verbs.ts` (one row per verb,
each with a lazy import), `actor.ts`, `client.ts`, `context.ts`, `output.ts`,
`errors.ts`, `flags.ts`, `sse.ts`, `installation.ts`, `gatewayRoutes.ts`,
`instructions.md`, and `commands/` with one file per verb. A verb loads its
module on dispatch, so `--help` loads no command module. A new verb needs both a
file under `commands/` and a row in `verbs.ts`.

## UI system

`packages/ui` owns every visual. Base UI gives behavior and accessibility. There
is no shadcn and no Radix.

[UI patterns](UI_PATTERNS.md) lists the canonical controls, group headers, and row patterns.
Reuse these elements across pages. Ask the user for advice before adding a new UI element or interaction pattern.

- Type: two typefaces carry the interface. `--sans` is Inter Variable, then a metric-matched Arial fallback, and it sets the prose: labels, buttons, menus, descriptions, and comments. `--mono` is BerkeleyMono, then JetBrains Mono, then a metric-matched local fallback, and it sets ticket ids through `font-mono`, plus code blocks and raw terminal output. The build preloads Inter and JetBrains Mono 400 only. BerkeleyMono is licensed per machine, so the repo ships no file for it and declares no face. A machine without it falls through to JetBrains Mono from fontsource, in the latin subset and the weights 400, 500, and 600. `tnum` lines up ids, counts, and times.
- The type scale is 11, 12, 13, 14, 16, 20, and 24 px, plus the two micro steps `text-kbd` at 10 px and `text-initials` at 9 px.
- Spacing has a 4 px base. Radius tokens range from 3 to 16 px, with `round` for circles and pills. Icon actions use the circular `IconButton`.
- The tokens carry a light and a dark palette in `tokens.css`. Every neutral is one seed grey mixed with white or with black, and a step keeps its position in the ramp across the two themes. The light `--success`, `--warning`, and `--danger` are dark enough for 4.5:1 on their own soft grounds. `tokens.test.ts` computes the ratio of every text and ground pair, and pins every value in the file, so Biome skips it.
- The bare `:root` block is the light palette. A media block serves the system preference and a `data-theme` block serves an explicit choice. A fresh profile starts dark: an inline head script reads `trellis-theme` from local storage, writes `dark` when the key is absent, and stamps `data-theme` before the first paint.
- Dark mode swaps every shadow for a 1 px strong border.
- `--accent` is the interface blue and `--agent` is the agent purple. Each one has a `-soft` ground.
- Status by category: todo is a faint empty circle, started is a warning half ring, review is an accent dotted ring, done is a success filled check, and canceled is a faint cross.
- Priority uses bars in `fg-muted`. Urgent is a filled danger square.
- Motion durations: 120 ms hover, 160 ms popover, 240 ms sheet slide, 160 ms row enter, and 200 ms ribbon sweep.
- Never animate a re-sort, a text change, a counter, a skeleton swap, or the theme switch. Use `motion/mini` and CSS transitions only.
- Focus uses a 2 px accent outline on `:focus-visible`. A row or a card uses an inset left bar.
- The primitives are Avatar, Badge, Button, Checkbox, Chip, Command, ConfirmDialog, Dialog, EmptyState, EntityCard, IconButton, Input, Kbd, Menu, Popover, ScrollArea, SectionHeader, Segmented, Select, Separator, Sheet, Skeleton, Spinner, Switch, Tabs, Textarea, Toast, and Tooltip.
- Domain visuals include StatusIcon, PriorityIcon, CheckRibbon, ReviewStateIcon, ReviewStatusSummary, ActorChip, TicketId, TrellisMark, InboxRow, FilterBar, FilterPopover, DisplayPopover, and GroupHeader.
- The route `/_gallery` renders every primitive in every state, in both themes.
- No raw color or spacing literal appears outside `packages/ui`. The Tailwind theme clears `--color-*`, so a utility such as `bg-red-500` does not exist. A Biome rule and a test enforce the tokens.

Every UI item passes the design checklist: optical alignment, tabular numbers,
hover, active, focus and disabled states, no layout shift when data arrives, hit
areas of 28 px on desktop and 44 px on mobile, contrast, density, motion
durations from the token table, reduced motion, and empty, loading, and error
states.
