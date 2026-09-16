# Architecture

trellis is a local ticket tracker for work that humans give to coding agents.
One server on the machine owns all data. The web app, the mobile app, and the
CLI reach that server over HTTP. The desktop host requires a bearer token and binds
`127.0.0.1`. The standalone server requires authentication when `TRELLIS_AUTH_TOKEN` is set. Read [SECURITY.md](../SECURITY.md) for the security
model.

## Stack

| Layer | Choice | Version |
|---|---|---|
| Runtime, package manager, test runner | Bun | 1.3 |
| Monorepo | Bun workspaces, Turborepo | turbo 2.10 |
| Language, lint, format | TypeScript, Biome | 7.0, 2.5 |
| Server | Hono | 4.13 |
| API | oRPC contract-first, Zod | 1.15, 4.5 |
| Database | PGlite with `pg_trgm`, Drizzle ORM, drizzle-kit | 0.5.8, 0.45, 0.31 |
| Web | React, Vite, TanStack Router, Query, Table, Virtual | 19, 8, current |
| UI primitives | Base UI, Tailwind, own tokens in `packages/ui` | 1.8, 4.3 |
| Editor, palette, drag and drop, motion, toasts, icons | Tiptap, cmdk, pragmatic-drag-and-drop, `motion/mini`, sonner, lucide-react | current |
| Flow canvas, flow layout | @xyflow/react, @dagrejs/dagre | 12.11, 3.1 |
| Fonts | BerkeleyMono, then JetBrains Mono from fontsource | 5.3 |
| Mobile | Expo, expo-router, React Native, NativeWind, FlashList, `expo-sqlite/kv-store`, `react-native-sse` | 57, 0.86, current |
| Desktop | Electron, macOS SMAppService | 44.3.0 |
| Native execution | Node, node-pty, fs-ext, Koffi | 26.8.2, 1.2.0-beta.15, 2.1.1, 3.3.0 |
| CLI | citty | 0.2 |
| End to end, perf | Playwright with Chromium, a seeded perf suite | current |
| Releases | changesets, GitHub Actions | |

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
├── scripts/                        the `bun run check` runner
└── test/                           the repository rules and the documentation links
```

The dependency graph is a star. Server, web, mobile, and CLI import `api`. The
CLI imports the contract as a type only. Only web imports `ui`. Each package
exports TypeScript source and has no side effects.

The standalone data home is `~/.trellis`, and `TRELLIS_HOME` overrides it.
It holds `db/`, `attachments/`, `backups/`, `agents/`, `runtime/`, and `server.log`.
Ticket worktrees live under `agents/<run id>/work`. The runtime retains process records and output under `runtime/`.
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
The explicit Quit Trellis Completely action pauses native dispatch, stops owned processes, and unregisters the helper.
An unconfirmed process prevents a successful stop.

The Bun host owns PGlite and the manager queue. A separate Node runtime owns agent PTYs.
Its private Unix socket uses protocol 9. A lifetime file lock permits one runtime owner.
Each attempt has one immutable identifier, a token hash, retained terminal output, and a process record.
Output readers receive bounded chunks with byte offsets.
The runtime preserves delivery identifiers before it writes input. An uncertain write remains unknown until an agent receipt confirms it.
A runtime restart never substitutes a new process for an unresolved attempt.
Natural leader exit stops the remaining members of its OS session. Explicit stop also includes descendant sessions observed while the leader remains live.
The runtime reports exit only after cleanup and output completion. Failed cleanup records an unknown result.
A descendant that leaves its session and loses its parent before inspection requires separate process inspection.

Built-in harnesses launch through `HarnessHost` with an interactive CLI in a PTY.
Builders and reviewers use native permission bypass settings.
Managers use a private workspace and a Trellis tool allowlist.
Each supported manager harness uses the selected persona instruction from the database as its exact system prompt.
The persona editor shows this instruction. Manager start and restart read the current saved persona.
The assignment message carries identity and project facts.
The manager delegates technical work and records coordination outcomes through these tools.
Claude, Codex, OpenCode, and Pi support this boundary. Custom manager launches return an explicit error.
Codex managers require CLI version 0.154.0 or later and run with no selected environments.
Their engine receives the shared Trellis allowlist as dynamic tools. Code-mode execution can call those tools without filesystem or shell access.
Clock and clarification tools remain available. The native terminal sends requests through the host, which preserves the manager policy and provider thread.
Claude hooks, the OpenCode plugin, and the Pi extension report provider identity, prompt receipts, tools, results, and errors.
Codex runs one private app-server per attempt. Its native terminal and Trellis event client connect to that engine.
The Codex adapter maps native thread, turn, tool, result, and error events into the runtime journal.
Every built-in start waits for the initial native prompt receipt. Each follow-up requires its own receipt. Busy providers queue follow-ups for their next turn.
The desktop starts HTTP before it resolves the login environment. Git, GitHub, and new agent launches await the cached environment in their server thread.
A failed login shell returns a tool error. Existing agent controls use their saved launch environment.
Each launch selects the active host release on PATH, including when the runtime predates that host.
`HarnessHost` exposes start, resume, send, interrupt, stop, status, and output APIs for native agent assignments.
Its immutable launch descriptors retain configuration. The runtime supplies process status and observed provider identity.
Assignment responses expose runtime-derived `processStatus` separately from the agent turn result. Terminal selection and process controls use that process status.
Current observations include the process check time, control availability, turn activity, and turn outcome.
Manager tools report `working` only for a controllable process with an active turn and no final outcome.
They permit replacement after confirmed cleanup or proof that the prior attempt never launched.
An exact prompt receipt confirms delivery. A provider turn and its observed activity time protect interrupt requests.
`bun run test:host` tests this module and the runtime with isolated processes.
`bun run test:host:real` also runs authenticated native CLI tests with explicit models and a configured credential home.

The runtime inspects the OS process before it reports status or permits input.
The host uses these observations for manager dispatch and flow completion.

The controller stores ticket events in `manager_dispatches` with a fixed coalescing deadline.
It sends a native manager one batch after the initial prompt receipt, when the runtime reports a live controllable process.
An exact durable receipt can resolve an unknown delivery without another send.
Stable assignment request identifiers prevent repeated worker starts from producing duplicate attempts.
Each dispatch tracks delivery separately from its per-ticket coordination outcomes.
Data-only envelopes include policy versions, stable assignment identifiers, and unfinished dispatches.
The manager records an assignment, queue entry, blocker, or reason for no action for each affected ticket.
A handled dispatch does not prove that a worker completed the ticket.
For a ticket, a `queued` outcome also saves a capacity wait in `manager_next_actions` in the same transaction.
The controller presents eligible waits as ticket work when capacity opens. It uses the assignment service's capacity rule.
An explicit `waitFor` on a `queued` or `blocked` outcome saves a time, dependency, or human-response condition.
Time waits use an absolute timestamp. Dependency waits require the named ticket to reach Done.
Human-response waits require a human reply to a root question on the deferred ticket. A reply prompts review and does not grant approval.
These conditions can notify the manager at full worker capacity. Worker starts still enforce capacity and the current wait condition.
Each wait retains its assignment identifier across dispatches and manager replacement.
Changing a wait condition cancels that action and creates a replacement with a new assignment identifier.
An assignment reserves the worker and records the action's assigned state in one transaction.
Pause and archive states prevent new assignments from saved actions. Ticket completion, a changed status, or a changed manager scope retires obsolete waits.
The manager can inspect waits through `controller.actions` and cancel one through `controller.cancelAction`.
The timestamps record creation, current eligibility, notification, and assignment. Historical outcomes remain receipts and do not create waits during migration.
Optional comment keys suppress duplicate writes for the same ticket and actor without new activity events.
A partial database index permits one active manager per project.

Native ticket agents use Git worktrees under `agents/<run id>/work`.
Workspace evidence binds checks and registered files to an attempt, HEAD, and a hash of the current file contents.
A later file change makes earlier evidence outdated. A passed process alone does not mark a ticket complete.
The ticket page centers its content and opens Activity first. Shared ticket details stay above the tabs.
The Agent tab shows the assigned agent's interactive terminal. Changes, Checks, and Flows hold their corresponding evidence.
The authenticated terminal stream replays retained bytes and then pushes output and process observations.
The terminal WebSocket carries ordered input and binary output outside the database request path after attachment. See [terminal transport](terminal-transport.md).
The terminal sends keyboard input and resize events to the runtime. An explicit reconnect resumes from the last displayed byte.
Settings includes runtime diagnostics. `trellis doctor --json` reads the same report without starting the runtime.

Native flows freeze the saved graph and persona instructions for each execution.
Each node occurrence binds to an ordinary agent attempt or a versioned human decision.
Gate results use complete YES or NO responses. Skipped branches remain explicit, and joins wait for their incoming paths to settle.
Group deadlines also reach the runtime process, so they remain effective after a host crash.
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

Settings exports browser drafts and imports them as separate recovery copies.
A flow recovery copy remains until the host acknowledges its saved graph.

Read the [implementation status](desktop/implementation-status.md), [desktop plan](desktop/trellis-desktop-plan.md), and [real acceptance report](desktop/acceptance/2026-09-14-native-real/report.md) for scope and measured results.

## Domain rules

Personas are local records shared across projects. Each persona has a name and
an instruction, and a kind: builder, reviewer, or manager. The Personas link of
the sidebar opens the Personas page at `/ai/personas`, with cards grouped by kind and
a slideout to create, edit, and delete these records. The API exposes
`personas.list`, `personas.get`, `personas.create`, `personas.update`, and
`personas.delete`. `personas.get` reads one persona by id. A client with a name
reads the list and matches on the name. `personas.list` sorts by name, then id. The
`personas.changed` event invalidates the cached persona list after a committed
mutation. A persona name holds 120 characters and an instruction holds 200,000
characters. Both fields are required and neither may be blank. A persona that
existed before the kind column takes the reviewer kind. A create without a kind
takes builder. A delete keeps the snapshots of the runs that used the persona.

- Projects form a tree. A root has a key (`^[A-Z][A-Z0-9]{1,9}$`) and a ticket counter. Tickets are `KEY-n` across the whole tree.
- Ticket numbers are never reused. A delete leaves a gap. A key is immutable once the counter is above zero (`KEY_LOCKED`).
- Nothing moves across roots: no ticket, no parent, no sub-project (`CROSS_ROOT_MOVE`). A ticket or a project cannot be its own ancestor (`PARENT_CYCLE`).
- Statuses belong to a project. A root starts with Todo (todo, default), In Progress (started), Agent Review (review, agent reviewer), Human Review (review, human reviewer), Done (done), and Canceled (canceled).
- A sub-project inherits the status set of the nearest ancestor until it creates its own set. The owner of a project is the nearest ancestor or self that owns statuses.
- Invariant: `tickets.status_id` belongs to the owner of `tickets.project_id`. The function `remapScope` restores the invariant after a first-status create, a clear, a re-parent, and a project move.
- The remap matches on name and category first, then on the lowest-position status of the same category, then on the default status of the owner.
- Every status-to-status move is legal. A WIP limit is advisory. The `category` of a status is immutable after creation.
- `started_at` is set once, when a ticket leaves todo. `completed_at` is set when a ticket enters done or canceled, and cleared when it leaves.
- Priority is none, urgent, high, medium, or low. There are no labels. A project limits concurrent active worker turns. Idle assignments retain their ticket ownership.
- Every non-GET request sends the header `x-trellis-actor: <human|agent>:<name>`. The name is printable ASCII without a colon, 1 to 64 characters.
- A missing header is `ACTOR_REQUIRED` and a malformed one is `ACTOR_INVALID`. A GET ignores the header. The header rejects the kind `system`, which trellis reserves for `system:trellis`.
- The optional header `x-trellis-session` is stored in `activity.meta.session`. trellis stores the name and the kind of an actor, and nothing else.
- The service enforces the agent policy, so curl obeys it too. Agents and managers can move tickets to Done. An agent cannot delete a ticket or a project (`AGENT_CANNOT_DELETE`, 403) without `force`.
- An archived project serves reads. Every mutation on it fails with `PROJECT_ARCHIVED`.
- `tickets.version` rises on every row change. `update` and `move` accept `expectedVersion` or the header `If-Match`. A mismatch is `VERSION_CONFLICT` (412) with the current row.
- `updated_at` moves only on user-visible activity: a ticket field, a comment, an attachment, or a pull request link. A reorder, a remap, and a poller CI change raise `version` only.
- A delete is a hard delete. A ticket delete nulls the `parent_id` of its children, then cascades comments, attachments, pull request links, and activity. The blob collector then removes unused files.
- A project delete needs an empty subtree or `force`.

### Chat rooms

Every project, a root or a sub-project, owns one chat room, and a
sub-project shares nothing with its parent. The room holds named channels.
`ai` and `general` exist in every room; the project create and the
migration insert them. A post to a channel the
room lacks creates the channel. A channel has no id: the API and the CLI
address it by its project and its lower-case name, with an optional `#`.
A channel can be for agents only (`aiOnly`); `ai` is one, and an agent can
create more with `trellis chat create <project> <name> --ai-only`. The
`manager` channel is `direct`: a direct message between a person and the
manager of the project. A post there reaches the live manager alone and
interrupts it; an agent other than that manager gets `CHAT_DIRECT`. The web
lists it under Direct messages with the manager's persona name. A person
who posts in such a channel gets `CHAT_AI_ONLY`. The web shows no composer,
no unread dot, and plays no sound for it.

`chat_attachments` holds one row per file posted in a room. The upload
stores the blob as a ticket attachment does, shares the blob of equal
bytes, and returns the markdown line the message carries. The bytes serve at
`/api/chat/attachments/{id}/file`. The boot sweep keeps every hash a row of
either attachment table names.

`chat_messages` holds one row per post with its actor. `chat_deliveries`
holds one row per post and live native agent of the room's project, except
the author. A post in `general` with no mention writes rows for the live
managers only.
A post that mentions a live agent by run id, by persona name, or by role
(`@manager`, `@builders`, `@reviewers`) reaches only the mentioned agents,
and each of those rows is `direct`. The controller tick sends every pending
row of one agent in one message, so a busy room costs an agent one turn.
The message carries, per channel, the messages before the first new line as
context: at most `CONTEXT_LIMIT` of them from the `CONTEXT_WINDOW_MINUTES`
before it. A
batch with a direct row interrupts the agent's current turn first; a custom
terminal has no interrupt and receives the lines as typed input. A manager
receives a `trellis.chat.messages` JSON document; a worker receives IRC style
lines and the two CLI commands. The states and the session pinning are the
states and the pinning of a comment mention.

The web route `/p/<project path>/chat` shows the room of the project as a log:
the clock and the full name on one line, the body as markdown under it,
with a dated rule where the day changes. A known `@name` renders as a mark.
A click on a name inserts a mention. The composer takes several lines, a
dropped, pasted, or picked file, and completes `@` from the live agents and
the roles. `/join <name>` in it creates a channel. The browser keeps the open channel, the unsent text of
each channel, and the read position of each channel in localStorage under
`trellis-chat`. A channel whose newest message id is above the read position
shows a dot, and so does the Chat link of every project in the tree. A new
message from someone else plays a short tone; Settings > Account switches it
off for that browser. The API is `chat.channels`, `chat.createChannel`,
`chat.list`, and `chat.post`. The events `chat.message`, `chat.delivery`,
and `chat.channels` invalidate the chat queries; `chat.message` carries the
actor, so a client knows its own posts. The CLI verb is `trellis chat`, and
the manager tools are `trellis_chat_*`.
What an agent is told about the room lives in `personas.instruction`, which
the migration `0047_persona_chat_instructions` appends to. Code injects no
prompt text.

### Project notes

A note is titled markdown on one project. Every agent of that project and of
its sub-projects reads it at start: a worker in its launch prompt and in
`trellis brief`, a manager in its launch context. `notes` holds one row per
note with its `audience` (`all`, `manager`, or `worker`), an optional
`expires_at`, and the actor of the last write. A read collects the notes of
the project and of every ancestor, newest change first, and drops an expired
note. A title is unique in its project without case; a repeated title is
`DUPLICATE`. A human and an agent can create, update, and delete a note. An
archived project serves reads and refuses writes. A project delete cascades
to its notes.

The API is `notes.list`, `notes.get`, `notes.create`, `notes.update`, and
`notes.delete`. The event `notes.changed` names the owning project and
invalidates every note query. The CLI verb is `trellis notes`, the manager
tools are `trellis_notes_*`, and the web route is `/p/<project path>/notes`.
What an agent is told about notes lives in `personas.instruction`, which the
migration `0053_persona_notes_instructions` appends to. Code injects no prompt
text; the launch prompt and the brief carry note content only.

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
Message edits require the expected version. The database serializes writes.
`review_submissions` holds fixed copies of selected findings and a local verdict.
A request identifier makes repeated submissions idempotent for one actor and PR.

`review_deliveries` records one notification per submission and recipient run.
The submission transaction creates the deliveries. A background task claims
pending records and calls the saved agent transport outside the transaction.
Failed sends remain unread. An interrupted send becomes unknown at startup
and requires an explicit resend. Agent acknowledgement sets `read_at`.

`review_imports` maps Margin identifiers to canonical message identifiers and
stores each source hash. A repeated import skips unchanged roots and reports
changed roots as conflicts. Imported anchors retain an unknown revision.
Backups and NDJSON exports include all five review tables.

The web route `/reviews/$owner/$repo/$number` uses the Trellis shell.
`@trellis/ui/review` wraps `@pierre/diffs` 1.4.2 with virtual scroll, workers,
line selection, and thread annotations. Review styles live in `packages/ui`.
Drafts persist in browser storage until the user submits them.
The `reviews.changed` event invalidates local review queries after commit.
Current GitHub status polls separately from the saved diff revision.

The Dots adapter exposes only its review graph and checks the PR target before
a run action. `apps/server/src/gateway.ts` owns the optional localhost gateway.
It reads the shared route file and redirects old Margin links to Trellis.
Read [the review guide](reviews.md) for commands and the service cutover.

### Agent runs

An agent run copies its persona name, kind, and instruction at launch. Later persona edits affect later runs.
A builder or reviewer names one ticket. A manager names one project.
The row retains the project path and ticket identifier so its history remains readable.

`agentRuns` exposes start, resume, stop, refresh, send, output, session inspection, terminal input, and terminal resize operations.
`GET /api/agent-runs/:id/terminal/stream` pushes terminal bytes and inspected process status through an authenticated SSE connection.
The runtime owns each process through a distinct execution attempt. Each attempt has an identifier, generation, and token hash.
A stable start request identifier returns its existing run before the concurrency check.
A changed target or persona rejects reuse of that identifier.

`agentRuns.start` accepts an optional model ID or alias for the assignment, after account selection determines its harness.
An omitted model uses the project setting. Custom commands reject explicit model overrides.
`agentRuns.resume` accepts a model override and otherwise retains the previous attempt's model.

Model IDs use Vercel AI Gateway names throughout Trellis. [The model catalog and guide](MODELS.md) describe the choices and harness mappings.

`agentRuns.setModel` interrupts a running turn, stops its process, and resumes the same assignment with the selected model.
The assignment retains its ticket, workspace, account, and provider conversation.
The project and account defaults stay unchanged.

Each model change requires the current attempt ID and a request ID. A repeated request returns the existing attempt.
The CLI exposes `agents start --model`, `agents resume --model`, and `agents model <id> --model`.
Managers can inspect the observed model through `trellis_agentRuns_session` with `include: ["model"]`.

The Manager page at `/p/<project path>/settings/manager` shows the manager's interactive terminal and process controls.
Project settings at `/p/<project path>/settings#manager` selects the persona, repository directory, concurrency limit, and automatic dispatch.
The dispatch switch pauses automatic messages while events remain stored.
The `#harness` section selects the preset, model, account, and custom start and resume commands.
The account applies to the manager and to every worker of the project that no request names an account for. A sub-project with no account uses the nearest ancestor that names one.
A running manager keeps its login until its next restart; the restart transfers its session to the new profile.
An empty child repository directory uses the nearest configured ancestor directory at launch.
An explicit child directory takes precedence. Persona, harness, and concurrency settings remain local to each project.
Trellis trusts configured repository directories and agent workspaces.
Both settings sections share one draft and save status. `projects.managerConfig` stores these fields with `ade: native`.

Every preset runs its command through a local PTY. Claude hooks identify ready, active, and completed turns.
`launchCommand.ts` combines the persona instruction with the project or ticket context.
The launch supplies the server URL, actor, run identifier, and attempt token through environment variables.
A manager uses the configured repository. A ticket agent uses a Git worktree under its run directory.

A stopped manager can resume its conversation. An explicit new session gets a new conversation identifier.
An interrupted manager requires reconciliation before another start.
API run states come from inspected runtime processes. The database records assignment closure in `closed_at`.
A missing runtime record produces `interrupted`; an observed process exit produces `exited` or `failed` from its exit code.
A failed launch retains its error. A stop retains the workspace and output after the runtime confirms process exit.

The concurrency target counts workers with at least 10 seconds of continuous work. Idle workers retain their open assignments without occupying slots. Managers are outside this count.
`occupiesSlot` uses runtime observations for starts, resumes, flow claims, saved waits, heartbeat counts, and delegated budgets.
A confirmed idle turn or process exit releases its slot. A completed turn outcome also releases its slot.
Only live, controllable workers with observed continuous work count toward the target. Pending launches and unobserved attempts consume no slots.
The runtime records `activity.workingSince` when work begins. Tool and message events preserve it; idle clears it.
Capacity uses each snapshot's `checkedAt` to measure that duration. Simultaneous starts and short turns can temporarily exceed the target.
A confirmed process exit closes its assignment before the next claim.
The limit runs from 1 to 64 and defaults to 3. A partial unique index permits one active manager per project.

### Sessions

A session is a scratch git repository with one agent, outside every project and ticket.
It answers the same need as a session in Superset: a place to try something with an agent and no ticket.
The directory is `sessions/<name>` in the data home, a repository on `main` with one empty commit.
The name is the directory name: lowercase letters, digits, and dashes, at most 40 characters.
A typed name takes that form; an omitted name takes a generated `<adjective>-<noun>`. A taken name gets a numeric suffix.
The `sessions` row keeps the name, the directory, the harness, and the run.
The run has the kind `session`, no persona, no project, and no ticket. Its name is the session name and its instruction is the prompt.
The agent receives the prompt as its first message and nothing else. It runs with the worker permission settings of its harness.
A session takes no worker capacity and receives no comment or chat delivery.
`sessions.start` resumes the saved conversation when the previous process confirmed one for the same harness, and otherwise starts the agent again from the prompt in the same directory.
A desktop restart stops a session agent with the other native agents and does not resume it; Start on the session page resumes it.
`sessions.delete` stops the agent, removes the directory, and deletes the row. The run stays as history with its retained output.

### Manager delegation

A manager delegates a child project subtree through `submanagers.start` with a brief, worker capacity, and stable request identifier.
The submanager uses the parent's persona and supports an explicit harness account. Its assignment preserves the parent identifier and delegated scope.
`manager_delegations` stores the assignment, parent, project, capacity, brief, and retirement time.
The project configuration remains unchanged. A configured manager or active delegation marks a scope boundary.

Each submanager receives its own controller queue and heartbeats. Parent heartbeat context includes its direct submanagers and their process state.
Normal human agent lists omit submanager assignments. The `submanagers` API retains inspection and control for diagnosis.
`submanagers.list` gives a manager its own delegation and direct children. `resize` changes a child's budget.
The aggregate budget counts workers with at least 10 seconds of continuous work across the delegated scope. Idle workers consume no budget. Existing per-project limits also apply.
Nested delegations reserve part of their parent's budget. Direct workers cannot consume those reserved slots.
Independent managers allocate separate subtree budgets. These budgets do not change provider limits or project concurrency settings.
Worker starts, resumes, flow steps, and capacity waits use the same budget rule.

Only the current scope owner can assign workers inside a delegation. A parent can resume, resize, or retire its direct submanagers.
`submanagers.retire` confirms process exit before it returns scope ownership and waits to the parent.
Ticket workers remain assigned. Wait handoff retains each assignment request identifier. Retired deliveries retain their history with a canceled send state when needed.
An unexpected manager exit retains its delegation. The parent sees that exit and can resume the saved conversation.
Migration `0049_manager_delegations` extends saved manager instructions without a conversation reset.
The instructions live in the `## Autonomous project delegation` section of the manager persona.

### Harness accounts

The main Settings page stores several accounts per harness at `/settings#agent-accounts`.
An account names an existing profile directory or a managed profile under `accounts/<id>/profile` in the data home.
Each managed profile keeps separate credentials. Shared directories retain sessions and skills. The provider CLI owns sign-in and token renewal.
Claude uses `CLAUDE_CONFIG_DIR`; Codex uses `CODEX_HOME`; Pi uses `PI_CODING_AGENT_DIR`; OpenCode uses `XDG_DATA_HOME`.
Removal archives the account record and retains its files.

`harnessAccounts.list` returns account metadata, login commands, and capabilities. Account mutation requires a human actor.
`harnessAccounts.quota` reads Claude or Codex subscription usage outside database transactions and caches results for five minutes.
A manual refresh has a ten-second minimum interval. OpenCode and Pi return `unsupported` quota.
An unavailable quota result contains no allowance estimate. Credentials stay on the host and do not enter API responses.

### Usage

The Usage page at `/usage` shows what every agent on the machine consumed.
`usage.report` reads the transcript files that each harness CLI writes: `projects/` of a Claude profile, `sessions/` of a Codex or Pi profile, `opencode/storage/` of an OpenCode data home, and `muse/sessions/` of the XDG data home for Muse, the Meta coding agent, which Trellis reads but does not launch.
The scan covers the default profile of each harness and the profile of every account, resolved to real paths, so a shared directory counts once.
The scan runs in the `prepare` step, outside every database transaction, and its result is cached for five minutes per range. A refresh is served from the cache for ten seconds.
Every turn is priced at the API list rate in `services/usage/pricing.ts`. A harness that records its own cost, such as Pi or OpenCode, keeps that cost. A model outside the table takes the cheapest rate of its harness and marks the row approximate.
A session joins the agent run whose `session_id` it carries. A session whose cwd is inside `agents/<run id>/work` joins that run. A session whose cwd is inside a project directory joins that project. Every other session is outside Trellis.
The report holds the day series by harness, the totals, one row list per grouping (ticket, persona, project, kind, account, model, harness), and the top 200 sessions with one key per grouping.
`usage.accounts` lists every configured account and the default login of each harness that no account names, each with its quota. A login whose provider reports no quota window is `unlimited`: an API key, a plan without limits, or a harness with no quota endpoint. The Muse login comes from `muse/auth.json` under the XDG config home. The page joins each login to its cost through the account grouping of the report.
The page keeps the range, the metric, the grouping, the selected row, and the selected day in the URL.

The default login of a harness resolves the way SuperSet resolves it. SuperSet keeps one pointer file per harness under `~/.superset/state/`: `default-claude-config-dir` and `default-codex-home`, each with the profile directory of the default, or nothing for the plain login. When the file exists it wins. Otherwise the account with the Trellis default flag wins. Otherwise the plain login of the harness is the default. A pointer whose directory is gone counts as the plain login. A default picked in Settings also writes the pointer, so both tools agree. A run with no account reads the pointer again at every launch, and a profile exported in the login shell wins over the pointer.

`agentRuns.start` accepts an optional `accountId`. A new assignment otherwise selects its harness default account.
The assignment retains its account across process restarts. An explicit account also selects its harness for a new assignment.
`agentRuns.resume` requires the stopped attempt identifier and a stable request identifier.
A resume retains the assignment, workspace, and provider conversation. Its target account must use the same harness.
Claude, Codex, and Pi transfer the selected session file. OpenCode exports and imports that session through its CLI.
The runtime checks the resumed provider session identifier before it accepts the process.
Existing manager personas receive the account instructions in migration `0048_harness_accounts`.
The instructions live in the `## Harness accounts` section of the manager persona.

### Manager controller

`manager_controller_cursors` records the last collected activity identifier for each project.
`manager_dispatches` retains event batches and their send state. The first event fixes the batch deadline at ten seconds.
The collector continues while dispatch pauses. It excludes the manager's own activity and respects child projects with their own manager.
A child project with its own manager persona is outside the scope of every manager above it. Its own manager receives its ticket events.
The project settings of a child ask for confirmation before the first persona is saved.
The change writes one activity row on the direct parent project: `project.subproject_manager_enabled` or `project.subproject_manager_disabled`, with a null ticket, the child path in `to_value`, and the child id in `meta.projectId`.
The collector delivers that row to the nearest manager above as an event with a null `ticketId` and the child under `project`. The manager records its outcome under a null ticket.

The controller sends a batch only to the current native attempt with a matching conversation and a live controllable process.
The controller queues a heartbeat after more than 120 seconds of idle time.
The manager creation time and last successful dispatch must also be more than 120 seconds old.
The controller skips a queued heartbeat if the manager becomes busy or reports new activity.
The runtime checks the observed idle turn before it accepts heartbeat input.
A heartbeat uses the same durable queue and receipt checks as ticket events. Its event list is empty.
Ticket events take precedence. The queue holds at most one pending or unresolved message per project.
Heartbeats respect project dispatch pause, the global work pause, and archived projects.
The heartbeat asks the manager to follow its current persona and status descriptions, inspect work, and avoid comments that only acknowledge the heartbeat.

Each heartbeat and ticket dispatch includes `capacityReminder` when projects with unfinished tickets have free worker slots.
The reminder reports `below_worker_capacity`, free slots, unfinished tickets, and counts for each eligible project.
Blocked and review tickets count as unfinished. Done and canceled tickets do not count.
The reminder uses the same runtime observations as the dispatch. Idle workers and confirmed process exits consume no slots.
Open assignments preserve ownership independently of capacity. Managers preserve idle conversations and advance independent work.

The counts respect project limits, submanager reservations, manager scope, archives, and dispatch pauses.
A submanager's shared capacity caps the total free slots across its projects.
The reminder is null when no project with unfinished tickets can accept another worker.

Each heartbeat and ticket dispatch includes `agentContext` from the runtime observations at dispatch time.
The JSON envelope retains policy references, ticket events, and unfinished work. Agent names use the assigned persona.
The context covers native assignments in the manager's project scope and excludes the recipient manager.
It includes open assignments and closed assignments whose processes still run.
Each entry carries assignment identifiers, process status, the process check time, harness activity, the last activity time, and `isWorking`.
Each entry also carries the current tool name when the agent reports active work.
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

The web Needs you page lists tickets in review statuses with a human reviewer across every project.
The list includes inherited and custom statuses, with or without a linked pull request.
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
take a persona, an instruction, or both. A human node takes an instruction. The
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
`FLOW_VERSION_CONFLICT`. A persona delete sets `persona_id` to NULL and keeps
the node. The editor saves drafts 600 ms after the last change, including
unfinished instructions and disconnected steps. Structural errors still block
a server save. Each browser tab keeps its pending draft in local storage,
with the server version it edits. A reload or a return to the editor restores
that draft. A completed save clears only the draft that it confirms. Edits
made during the request keep the returned version for the next save.
The topbar shows the save status and the count of draft issues. A conflict
keeps the browser draft. A reload of the server graph requires explicit
confirmation to discard that draft.

## Web routes

The routes are TanStack Router file routes under `apps/web/src/routes/`.

| route | file | page |
|---|---|---|
| `/` | `index.tsx` | a replace redirect to `/needs-you` |
| `/needs-you` | `needs-you/route.tsx` | human review tickets and personal mentions across every project |
| `/all` | `all/route.tsx` | every ticket as a board |
| `/all/table` | `all_.table.tsx` | every ticket as a table |
| `/p/$` | `p/$/route.tsx` | a project as a board, a table, its settings, or its manager |
| `/t/$identifier` | `t/$identifier/route.tsx` | one ticket |
| `/sessions/$id` | `sessions.$id.tsx` | one session: the terminal of its agent and the process controls |
| `/search` | `search.tsx` | search |
| `/ai/personas` | `ai.personas.tsx` | the personas |
| `/ai/flows` | `ai.flows.tsx` | the flows |
| `/ai/flows/$slug` | `ai.flows_.$slug.tsx` | one flow in the canvas editor |
| `/settings` | `settings.tsx` | the settings |
| `/setup` | `setup.tsx` | the first visit, and the new project step |
| `/_gallery` | `[_]gallery.tsx` | every primitive in every state, in both themes |

Ticket links open `/t/$identifier`. The header shows the project name and ticket
identifier, with the actions on the right. The content sits in fully rounded
cards below the header.
Every page card has a gap from the sidebar, the right edge, and the bottom edge.
The gap is 12 px on desktop and 8 px on a phone. Back to list restores the
last list URL with its filters.

`/p/$` takes one splat, `[key, ...slugs, view?]`. The URL keeps slashes and the
API ref joins the same segments with dots, so `/p/CDE/web/auth` reads
`CDE.web.auth`. The last segment is a view only when it is a reserved slug:
`table`, `settings`, or `board`. A `CHECK` on `projects.slug` refuses `board` and
`settings`, so a sub-project never takes one of those names.

The board uses the bare project URL. An older link
that ends in `/board` redirects to the same path with the segment dropped. The
manager page is the two segments `settings/manager`. `parseProjectSplat` and
`projectHref` in `apps/web/src/lib/projectPath.ts` hold both directions.

The URL carries the whole view state in the shared filter grammar, with no
default written. `beforeLoad` redirects a non-canonical search string to its
canonical spelling, so one view has one URL.

A settings page keeps its section in the URL hash and shows one section at a
time. The first section of each page carries no hash.

| page | sections |
|---|---|
| `/settings` | Account (no hash), `#integrations` |
| `/p/<path>/settings` | General (no hash), `#template`, `#statuses`, `#repositories`, `#subprojects`, `#archive` |
| `/p/<path>/settings/manager` | Operation (no hash), `#settings`, `#harness` |

`/settings` holds the actor name, theme, GitHub state, phone pair code, drafts, and runtime diagnostics.
The Manager page holds the manager persona, repository directory, dispatch state, concurrency limit, and harness commands.
It writes `projects.managerConfig` through `projects.update`.

The sidebar holds the workspace row, Needs you, Search, All tickets, Pull
requests, Personas, Flows, Usage, the sessions, the project tree, and the actor footer.
The sessions and the project tree share the one region that scrolls, so the fixed
links keep their place at any height.
The Sessions section sits above the Projects section. Its New session button opens
a sheet with the prompt, an optional name, and the harness. Each session row shows
the avatar of its agent with the work state and opens `/sessions/<id>`. Its row
menu deletes the session.
Each project row shows the Trellis mark and opens the manager terminal at
`/p/<path>/settings/manager`. Tickets and Settings appear below it.
The selected state follows the current page for root, nested, and archived projects.

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
| projects | id PK, parent_id, root_id, key (UNIQUE, CHECK regex), slug (CHECK slug regex, not `board` or `settings`), name (1 to 120), description, manager_config jsonb (`personaId`, `concurrency`, `directory`, `dispatchPaused`, `ade: native`, `harness` (`preset`, `startCommand`, `resumeCommand`)), ticket_template, ticket_counter, position, archived_at, created_at, updated_at. UNIQUE (id, root_id). FK (parent_id, root_id). UNIQUE NULLS NOT DISTINCT (parent_id, slug). CHECK `(parent_id IS NULL) = (root_id = id)`, `(parent_id IS NULL) = (key IS NOT NULL)`, `parent_id <> id`, `parent_id IS NULL OR ticket_counter = 0`. Index (root_id). |
| repos | id PK, project_id (CASCADE), owner, repo (both CHECK lowercase). UNIQUE (project_id, owner, repo). The effective repos of a project are its own plus those of its ancestors. |
| statuses | id PK, project_id (CASCADE), name (1 to 40), description (CHECK <= 2000), slug, category (CHECK set), reviewer (CHECK `(category = 'review') = (reviewer IS NOT NULL)`), color, position, wip_limit (CHECK > 0), is_default, created_at, updated_at. UNIQUE (project_id, name) and (project_id, slug). Partial UNIQUE (project_id) WHERE is_default. |
| tickets | id PK, project_id, root_id, number (CHECK > 0), title (CHECK trimmed, 1 to 500), description, priority (CHECK set), status_id (FK statuses RESTRICT), parent_id, position double, version, started_at, completed_at, search tsvector GENERATED (title A, description B), created_at, updated_at. UNIQUE (root_id, number) and (id, root_id). FK (project_id, root_id) RESTRICT and FK (parent_id, root_id) RESTRICT. Indexes (project_id, status_id, position), (status_id, position, id, project_id, root_id), (parent_id), partial (root_id, updated_at DESC) WHERE completed_at IS NULL, partial (root_id, completed_at DESC) WHERE completed_at IS NOT NULL, GIN (search), GIN (title gin_trgm_ops). |
| comments | id PK, ticket_id (CASCADE), body (1 to 200000), parent_id, resolved_at, actor_name, actor_kind, search tsvector GENERATED (body C), created_at, updated_at. FK to actors. UNIQUE (id, ticket_id). FK (parent_id, ticket_id) CASCADE, so a reply stays on the ticket of its root. CHECK `parent_id <> id` and `parent_id IS NULL OR resolved_at IS NULL`, so only a root carries the resolved mark. Index (ticket_id, created_at) and (parent_id). GIN (search). |
| attachments | id PK, ticket_id (CASCADE), filename (1 to 255, no `/`), mime, size (CHECK > 0), sha256 (CHECK hex 64), actor_name, actor_kind, created_at. FK to actors. Index (ticket_id) and (sha256). |
| pull_requests | id PK, owner, repo (CHECK lowercase), number (CHECK > 0), url, title, state, is_draft, head_ref, base_ref, review_state, merged_at, closed_at, checks jsonb (CHECK array), ci_state, content_hash, fetched_at, fetch_error, created_at, updated_at. UNIQUE (owner, repo, number). Index (state, ci_state). |
| ticket_pull_requests | ticket_id (CASCADE), pull_request_id (CASCADE), source (manual or auto), actor_name, actor_kind, created_at. PK (ticket_id, pull_request_id). Index (pull_request_id). |
| activity | id bigint IDENTITY PK, batch_id, root_id (CASCADE), project_id (CASCADE), ticket_id (CASCADE), actor_name, actor_kind, action, field, from_value, to_value, meta jsonb, created_at. FK to actors. CHECK `field <> 'description' OR (from_value IS NULL AND to_value IS NULL)`. Indexes (ticket_id, id), (ticket_id, created_at DESC, id DESC), (root_id, id), (project_id, id), (created_at). |
| actors | name (CHECK 1 to 64, no `:`), kind (human, agent, or system), first_seen_at, last_seen_at. PK (name, kind). |
| settings | key PK, value jsonb, updated_at. |
| personas | id PK, name (CHECK 1 to 120, not blank), kind (CHECK builder, reviewer, or manager; default reviewer), instruction (CHECK 1 to 200000, not blank), created_at, updated_at. |
| flows | id PK, slug (UNIQUE, CHECK slug regex, 64 at most), name (1 to 120), description (CHECK <= 2000), briefing (CHECK <= 200000), version (CHECK > 0), created_at, updated_at. |
| flow_nodes | id PK, flow_id (CASCADE), parent_id, kind (CHECK agent, gate, human, group, or loop), title (0 to 120), persona_id (FK personas SET NULL), instruction (CHECK <= 200000), parallel (boolean, group only), minutes (optional, group only, 1 to 1440), max_rounds (CHECK `(kind = 'loop') = (max_rounds IS NOT NULL)`, 1 to 50), x, y, width, height (CHECK >= 40). UNIQUE (id, flow_id). FK (parent_id, flow_id) CASCADE, so a group and the nodes inside it stay in one flow. Indexes (flow_id) and (persona_id). |
| flow_edges | id PK, flow_id (CASCADE), from_node_id, to_node_id, branch (CHECK out, yes, or no). FK (from_node_id, flow_id) and FK (to_node_id, flow_id) to flow_nodes CASCADE. UNIQUE (from_node_id, branch, to_node_id). CHECK `from_node_id <> to_node_id`. Indexes (flow_id) and (to_node_id). |
| harness_accounts | id PK, name, harness, profile_path, is_default, enabled, archived_at, created_at, updated_at. Partial UNIQUE (harness, profile_path) for current accounts. Partial UNIQUE (harness) for current default accounts. |
| agent_runs | id PK, name, account_id (FK harness_accounts), runtime (default `native`), persona_id (FK personas SET NULL), persona_name, kind (CHECK the three persona kinds and `session`), instruction, project_id (SET NULL), project_path, ticket_id (SET NULL), ticket_identifier, closed_at, workspace_id, terminal_id, url, error, session_id, session_lost (default false), created_at, updated_at. Partial index (ticket_id) WHERE `closed_at IS NULL`. Partial UNIQUE (project_id) WHERE `kind = 'manager'` AND `closed_at IS NULL`. Index (created_at). |
| agent_sessions (stored history) | id PK, project_id (CASCADE), ticket_id (CASCADE), role (CHECK manager, builder, reviewer), runner (CHECK superset), state (CHECK starting, running, waiting, exited, stopped, failed), workspace_id, terminal_id, claude_session_id, name (1 to 40), title (1 to 120), open_url, last_woken_at, error, created_at, updated_at. CHECK `(role = 'manager') = (ticket_id IS NULL)`. Indexes (project_id, role, state) and (ticket_id). Partial UNIQUE (project_id) WHERE the role is manager and the state is live. Partial UNIQUE (workspace_id, terminal_id) WHERE both are set. |
| agent_cursors | project_id PK (CASCADE), activity_id bigint, updated_at. Stored activity cursor from earlier data homes. |
| sessions | id PK, name (UNIQUE, CHECK lowercase letters, digits, and dashes, 1 to 40), directory, harness jsonb, run_id (UNIQUE, FK agent_runs), created_at, updated_at. The run has the kind `session`, no persona, no project, and no ticket. |

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

The schema migrations live in `apps/server/drizzle/`, through `0037_agent_assignment_closure`.
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
| ProjectRef | ULID, `KEY`, or `KEY.slug(.slug)*` | `CDE.web.auth` |
| StatusRef | ULID, slug, name, or `category:<category>` | `in-progress`, `category:review` |
| Actor header | `human:<name>` or `agent:<name>` | `agent:claude-code` |

| procedure | route | notes |
|---|---|---|
| projects.list | GET /api/projects | flat list with path, depth, and open count |
| projects.get | GET /api/projects/{project} | ancestors, children, repos, effective statuses, ticket template |
| projects.create | POST /api/projects | 201 and `Location`; a root needs a key, a child rejects one |
| projects.update | PATCH /api/projects/{project} | name, slug, description, ticket template, archived |
| projects.move | POST /api/projects/{project}/move | parent, after, before |
| projects.delete | DELETE /api/projects/{project} | `force` deletes a non-empty subtree |
| projects.setRepos | PUT /api/projects/{project}/repos | full replace, idempotent |
| statuses.list, create, update, reorder | GET, POST /api/projects/{project}/statuses; PATCH .../{status}; PUT .../order | the category is immutable |
| statuses.delete | DELETE /api/projects/{project}/statuses/{status} | `moveTo` moves the tickets first |
| statuses.clear | DELETE /api/projects/{project}/statuses | sub-projects only |
| tickets.list | GET /api/tickets | the shared filter grammar; `{items, nextCursor}` and no total |
| tickets.counts | GET /api/tickets/counts | the same filters; `{total, byStatus}` |
| tickets.board | GET /api/tickets/board | one query; each column carries a count and its first 100 cards |
| tickets.get | GET /api/tickets/{ticket} | the full ticket with project, status, parent, children, prs, attachments |
| tickets.create | POST /api/tickets | 201 and `Location` |
| tickets.update | PATCH /api/tickets/{ticket} | `If-Match` maps to `expectedVersion` |
| tickets.move | POST /api/tickets/{ticket}/move | status, after, before, force; an anchor must be in the target column |
| tickets.updateMany, deleteMany | POST /api/tickets/update-many, delete-many | up to 200 refs in one transaction |
| tickets.delete | DELETE /api/tickets/{ticket} | `force` overrides the agent policy |
| timeline.list | GET /api/tickets/{ticket}/timeline | comments and activity merged, newest first |
| comments.create, update, delete | POST /api/tickets/{ticket}/comments; PATCH, DELETE /api/comments/{id} | a create with `parentId` joins that thread |
| comments.thread, resolve | GET /api/comments/{id}/thread; POST /api/comments/{id}/resolve | the root comment and every reply; resolve takes the reopen too |
| attachments.list, upload, get, delete | GET, POST /api/tickets/{ticket}/attachments; GET, DELETE /api/attachments/{id} | the bytes come from GET /api/attachments/{id}/file |
| pullRequests.list, link, unlink, refresh | GET, POST /api/tickets/{ticket}/prs; DELETE /api/tickets/{ticket}/prs/{id}; POST /api/prs/{id}/refresh | a link is idempotent |
| pullRequests.diff | GET /api/prs/{id}/diff | `gh pr diff`, cut at 1 MB, cached for 60 s |
| personas.list, get, create, update, delete | GET, POST /api/personas; GET, PATCH, DELETE /api/personas/{id} | the manager tool list omits instructions; get reads one |
| flows.list, get, create, update, save, delete | GET, POST /api/flows; GET, PATCH, DELETE /api/flows/{flow}; PUT /api/flows/{flow}/graph | `{flow}` is a ULID or a slug; save replaces every node and edge |
| agentRuns.list, start | GET, POST /api/agent-runs | start answers 201 with the row in any state |
| agentRuns.stop, refresh, send | POST /api/agent-runs/{id}/stop, /refresh, /send | send takes 1 to 20000 characters |
| agentRuns.resume | POST /api/agent-runs/{id}/resume | existing assignment, accountId, expectedTerminalId, requestId |
| harnessAccounts.list, create, update, remove | GET, POST /api/harness-accounts; PATCH, DELETE /api/harness-accounts/{id} | account metadata and profile selection |
| harnessAccounts.quota | GET /api/harness-accounts/{id}/quota | cached usage windows and reset times |
| usage.report | GET /api/usage | token cost from the harness transcripts, joined to runs, tickets, personas, projects, and accounts; cached for five minutes |
| usage.accounts | GET /api/usage/accounts | every configured account and each default login with its subscription quota; cached for five minutes |
| agentRuns.output | GET /api/agent-runs/{id}/output | the terminal text as `{text}` |
| sessions.list, get | GET /api/sessions, /api/sessions/{id} | newest first; get carries the observed run |
| sessions.create | POST /api/sessions | 201 and `Location`; a prompt, an optional name, an optional harness and account |
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
child counts, the comment and attachment counts, the pull request rollup, the
last actor, the position, the version, and the timestamps. It is about 300
bytes. Only `tickets.get` returns the description.

The filter grammar is identical in the API, the web URL, and the CLI flags.

| param | values |
|---|---|
| project | a ProjectRef; `subprojects=false` narrows to that project |
| status | a list of StatusRef |
| category | a list of todo, started, review, done, canceled |
| reviewer | human or agent |
| priority | a list |
| parent | a TicketRef or `none` |
| pr | any, none, open, draft, merged, closed |
| ci | a list of pass, fail, pending, none |
| actor | `kind:name` or `name`, matched against the last actor |
| q | full text search with a prefix on the last token |
| updated, created, completed | ISO lower bounds |
| sort | `[-]updatedAt`, createdAt, priority, number, status, or position |
| cursor, limit | an opaque cursor bound to the filter hash; limit 1 to 200, default 50 |

One example on the three surfaces:

```
GET /api/tickets?project=CDE&status=in-progress,agent-review&parent=none&ci=fail&sort=-updatedAt
/p/CDE?status=in-progress,agent-review&parent=none&ci=fail&sort=-updatedAt
trellis list --project CDE --status in-progress,agent-review --parent none --ci fail --sort -updatedAt
```

The contract declares every error as `{defined, code, status, message, data}`.
The map lives in `packages/api/src/errors.ts`: INPUT_VALIDATION_FAILED 400,
ACTOR_REQUIRED 400, ACTOR_INVALID 400, INVALID_CURSOR 400, INVALID_PR_URL 400,
AGENT_CANNOT_DELETE 403, NOT_FOUND 404, DUPLICATE
409, KEY_LOCKED 409, STATUS_NOT_IN_PROJECT 409, STATUS_IN_USE 409, LAST_STATUS
409, ROOT_STATUSES 409, STATUS_CATEGORY_IMMUTABLE 409, CROSS_ROOT_MOVE 409,
PARENT_CYCLE 409, PROJECT_NOT_EMPTY 409, PROJECT_ARCHIVED 409,
COMMENT_PARENT_MISMATCH 409, COMMENT_HAS_REPLIES 409, INVALID_ANCHOR 409,
CONCURRENCY_LIMIT 409, VERSION_CONFLICT 412, FLOW_VERSION_CONFLICT 412, PAYLOAD_TOO_LARGE 413,
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
`statuses.changed {projectId}`,
`project.created | updated | deleted | moved {id}`, `gh.status {ok, reason}`,
`personas.changed {id}`, `flows.changed {id}`, `agent-runs.changed {id}`, `sessions.changed {id}`, and `needs-you.changed {actorName}`.
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
priority, parent, completed, create, and delete. It runs through a coalescer
with a 250 ms trailing delay and a 1 s maximum. A mutation writes its response with `setQueryData` and invalidates on an
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
query for one pull request. A row is written only when its content hash changes.

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

Auto-link runs every 120 seconds. It runs one `gh pr list` per declared repo,
then matches `\b([a-z][a-z0-9]{1,9})-(\d+)\b` over the title, the branch, and
the body. It links as `system:trellis` with the source `auto`.

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

## Performance budgets

The budgets are for the reference machine against a deterministic seed in
`apps/server/test/perf/seed.ts`. The seed writes N tickets across 3 roots and 8
projects per root, with 10 activity rows and 2 comments per ticket, 2 KB
descriptions, and 40 open pull requests. `bun run perf:10k` runs the 10k seed, and
`bun run perf` runs the 50k seed. Performance tests are optional.

| metric | target | test |
|---|---|---|
| Cold boot to `/api/health` 200 | 1.5 s warm data home, 3.5 s first run | perf/boot |
| `tickets.list` p95, default table query | 5 ms at 1k, 10 ms at 10k, 20 ms at 50k; 40 ms with `q` | perf/list |
| `tickets.board` and `tickets.counts` at 50k | 30 ms each | perf/list |
| `search.query` p95 at 50k | 40 ms; 3 ms for `KEY-n` | perf/search |
| SSE commit to repaint | 100 ms on the patch path; 500 ms on the invalidation path | e2e/live |
| Kanban drop | optimistic paint in 16 ms | e2e/kanban |
| Web bundle | 220 KB gzip initial JS; 200 KB lazy Tiptap; 900 KB total; 160 KB fonts | scripts/size-budget |
| First paint | 300 ms FCP; rows in 600 ms cold and 150 ms warm | e2e/paint |
| Server RSS at 50k | 350 MB idle, 550 MB peak | perf/memory |
| Poller | 1 gh process per 50 due pull requests per tick; 250 ms CPU per tick | perf/poller |
| Upload | 50 MB in 1 s; event loop stall 50 ms; serve 50 MB in 300 ms | perf/attachments |
| CLI | `--help` under 300 ms from source | cli/coldStart |
| Mutations under 5 concurrent agents | 15 ms server time p99 each and 30 ms max, and list p95 still in budget | perf/concurrency |
| Backup at 50k | 1.5 s hold, 15 s total | perf/backup |

`TRELLIS_PERF_FACTOR` scales every number in this table and defaults to 1. The
CI workflow runs `check`, the Playwright suite, the mobile Jest suite, and the
migration diff. It runs no performance test.

These budgets shape the design. The database worker keeps the synchronous WASM
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

- One folder per module or component: `Name/Name.ts(x)`, `Name/Name.test.ts(x)`, `Name/index.ts`.
- Co-locate by usage. One user nests it under that user's `components/`. Two users promote it to the highest shared parent.
- One exported component or service per file. Split a file over 300 lines.
- Tests sit beside the code they test. Fixtures and helpers live in `test/` at the workspace root. Perf and end-to-end suites are directories.
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
server, so a Biome rule and a test with a 2 second timeout enforce the rule.

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
attachments, board, command, composer, filters, needs-you, personas, pickers,
project-actions, project-manager, project-settings, prs, search, settings, setup,
shell, sidebar, table, ticket), `components/`, `hooks/`, `lib/`, and `stores/`. The end-to-end suite is in `apps/web/e2e/`, the test server is in
`apps/web/test/server/`, and the size budget script is in `apps/web/scripts/`.

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

| kind | where | runs in |
|---|---|---|
| unit | beside the module, `*.test.ts` | `bun test`, in-memory PGlite, inline transport |
| contract | `apps/server/src/procedures/*.test.ts` | `bun test`, an oRPC client over `app.request` |
| component | beside the component, `*.test.tsx` | `bun test`, Testing Library, happy-dom, the real server in process |
| CLI smoke | `packages/cli/test/` | `bun test`, a spawned server on a random port |
| repository | `test/` at the root | `bun run test:repo`, the repository rules and the documentation links |
| perf | `apps/server/test/perf/`, `apps/web/scripts/size-budget.ts` | optional `perf:10k` at 10k rows, `perf` at 50k rows |
| end to end | `apps/web/e2e/` | Playwright with a temporary `TRELLIS_HOME` |

Every service test ends with `assertStatusInvariant(tx)`. `test/preload.ts`
gives a test run a fresh `TRELLIS_HOME`, so no test touches `~/.trellis`.

The web workspace ships no fake server. `apps/web/test/server` builds the Hono
app of `apps/server` over an in-memory PGlite and hands the page that app's
`fetch`, which is what `createOrpc` takes. A page test therefore exercises the
real procedures, the real services, and the real queries.

The harness keeps three costs down. One in-memory PGlite serves every test of one
file, because an instance takes about half a second to open. The seed runs through
the real services once and its rows go to a JSON snapshot under
`apps/web/.cache/seed`; the cache key hashes the seed sources and the migration
files, so a change to either builds a new snapshot. Each test restores that
snapshot into the shared database. `apps/web` runs its test files on four
workers, because the preload gives each process its own `TRELLIS_HOME`.

The harness wraps the service transport, so a test reads the input and the actor
of every service call, holds a call until it releases it, and makes a declared
error take the place of a service. `gh auth status` answers from the state the
test set, and every other gh call reaches the gh stub. Native execution tests use isolated runtime processes and fixture harnesses.

The end-to-end suite covers the agent failure page, the dispatch path, and the
pair link, beside the ticket, board, table, and live paths.

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
- Domain visuals include StatusIcon, PriorityIcon, CheckRibbon, ActorChip, TicketId, TrellisMark, InboxRow, FilterBar, FilterPopover, DisplayPopover, and GroupHeader.
- The route `/_gallery` renders every primitive in every state, in both themes.
- No raw color or spacing literal appears outside `packages/ui`. The Tailwind theme clears `--color-*`, so a utility such as `bg-red-500` does not exist. A Biome rule and a test enforce the tokens.

Every UI item passes the design checklist: optical alignment, tabular numbers,
hover, active, focus and disabled states, no layout shift when data arrives, hit
areas of 28 px on desktop and 44 px on mobile, contrast, density, motion
durations from the token table, reduced motion, and empty, loading, and error
states.
