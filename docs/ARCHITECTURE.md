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
Its private Unix socket uses protocol 9. A lifetime file lock permits one runtime owner.
Each attempt has one immutable identifier, a token hash, retained terminal output, and a process record.
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
The terminal WebSocket carries ordered input and binary output outside the database request path after attachment. See [terminal transport](terminal-transport.md).
The terminal sends keyboard input and resize events to the runtime. An explicit reconnect resumes from the last displayed byte.
`trellis doctor --json` reads runtime diagnostics without starting the runtime.

Native flows freeze the saved graph and inline node instructions for each execution.
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
- Priority is none, urgent, high, medium, or low. Projects own label groups, and each label belongs to one group. A sub-project does not inherit groups or labels. Tickets do not yet use labels.
- Every non-GET request sends the header `x-trellis-actor: <human|agent>:<name>`. The name is printable ASCII without a colon, 1 to 64 characters.
- A missing header is `ACTOR_REQUIRED` and a malformed one is `ACTOR_INVALID`. A GET ignores the header. The header rejects the kind `system`, which trellis reserves for `system:trellis`.
- The optional header `x-trellis-session` is stored in `activity.meta.session`. trellis stores the name and the kind of an actor, and nothing else.
- The service enforces the agent policy, so curl obeys it too. Agents can move tickets to Done. An agent cannot delete a ticket or a project (`AGENT_CANNOT_DELETE`, 403) without `force`.
- An archived project serves reads. Every mutation on it fails with `PROJECT_ARCHIVED`.
- `tickets.version` rises on every row change. `update` and `move` accept `expectedVersion` or the header `If-Match`. A mismatch is `VERSION_CONFLICT` (412) with the current row.
- `updated_at` moves only on user-visible activity: a ticket field, a comment, an attachment, or a pull request link. A reorder, a remap, and a poller CI change raise `version` only.
- A delete is a hard delete. A ticket delete nulls the `parent_id` of its children, then cascades comments, attachments, pull request links, and activity. The blob collector then removes unused files.
- A project delete needs an empty subtree or `force`.

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
Review comments remain local. The review form submits its comment, approval, or
change request to GitHub. The same request refreshes the stored pull request and
writes activity for every linked ticket.

The web route `/reviews/$owner/$repo/$number` uses the Trellis shell.
`@trellis/ui/review` wraps `@pierre/diffs` 1.4.2 with virtual scroll, workers,
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
A stable start request identifier returns its existing run instead of a new launch.
A changed target rejects reuse of that identifier.

`agentRuns.start` accepts an optional harness configuration and a canonical model ID for the assignment.
The harness configuration includes its preset, model, and optional effort. The API validates effort against the selected harness and model.
An omitted model uses the configured default. Custom commands reject explicit model overrides.
`agentRuns.resume` accepts a model override and otherwise retains the previous attempt's model and effort.

The assignment plus button opens a dialog with Harness, Model, and the supported effort choices.
The effort label follows the harness: Effort for Claude, Reasoning effort for Codex, Thinking level for Pi, and Variant for OpenCode.
The dialog hides effort when the selected model has no supported options.

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
The launch supplies the server URL, actor, run identifier, and attempt token through environment variables.
Each new agent in a configured repository uses a Git worktree under its run directory. This includes sessions, ticket agents, and flow agents.
API run states come from inspected runtime processes. The database records assignment closure in `closed_at`.
A missing runtime record produces `interrupted`; an observed process exit produces `exited` or `failed` from its exit code.
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

### Harness accounts

The Usage page stores several accounts per harness at `/usage`.
An account names an existing profile directory or a managed profile under `accounts/<id>/profile` in the data home.
Each managed profile keeps separate credentials. Shared directories retain sessions and skills. The provider CLI owns sign-in and token renewal.
Claude uses `CLAUDE_CONFIG_DIR`; Codex uses `CODEX_HOME`; Pi uses `PI_CODING_AGENT_DIR`; OpenCode uses `XDG_DATA_HOME`; Muse uses one directory as `XDG_CONFIG_HOME` and `XDG_DATA_HOME`, so `muse/auth.json` and `muse/sessions` sit under the profile.
Removal archives the account record and retains its files.

`harnessAccounts.list` returns account metadata, login commands, and capabilities. Account mutation requires a human actor.
`harnessAccounts.quota` reads Claude or Codex subscription usage outside database transactions and caches results for five minutes.
A manual refresh has a ten-second minimum interval. OpenCode and Pi return `unlimited` quota.
Muse returns `signed_out` for a profile without `muse/auth.json`, unless a saved quota error has an active exhausted window.
Muse announces its subscription windows to its session client after each model call. The Muse bridge saves the latest announcement to `muse/trellis-usage.json`.
The bridge saves the reset time from a subscription quota error to `muse/trellis-quota.json`.
The bridge serializes writes across processes and keeps the newest observation in each file.
The separate quota file keeps a late usage announcement from removing an active error. An active exhausted window reads `ok` at 100 percent.
A normal snapshot with a later observation time supersedes an older quota error.
Before the first run, or after every saved window has reset, the account is `unavailable` with a sentence that asks for a run.
An unavailable quota result contains no allowance estimate. Credentials stay on the host and do not enter API responses.

### Usage

The Usage page at `/usage` shows what every agent on the machine consumed.
`usage.report` reads the transcript files that each harness CLI writes: `projects/` of a Claude profile, `sessions/` of a Codex or Pi profile, `opencode/storage/` of an OpenCode data home, and `muse/sessions/` of a Muse data home, the default XDG data home or a Muse account profile.
The scan covers the default profile of each harness and the profile of every account, resolved to real paths, so a shared directory counts once.
The scan runs in the `prepare` step, outside every database transaction. A child worker parses the transcripts and builds the report. Database calls continue during the scan. The server caches each range for five minutes. A refresh uses a cached result for ten seconds.
Every turn is priced at the API list rate in `services/usage/pricing.ts`. A harness that records its own cost, such as Pi or OpenCode, keeps that cost. Muse Spark has no list price, so a Muse turn counts its tokens at zero dollars. A model outside the table takes the cheapest rate of its harness and marks the row approximate.
A session joins the agent run whose `session_id` it carries. A session whose cwd is inside `agents/<run id>/work` joins that run. A session whose cwd is inside a project directory joins that project. Every other session is outside Trellis.
The report holds the day series by harness, the totals, one row list per grouping (ticket, agent, project, kind, account, model, harness), and the top 200 sessions with one key per grouping.
`usage.accounts` lists every configured account and the default login of each harness that no account names, each with its quota. A login whose provider reports no quota window is `unlimited`: an API key, a plan without limits, or a harness with no quota endpoint. The default Muse login comes from `muse/auth.json` under the XDG config home, and a Muse account profile holds its own `muse/auth.json`. Its windows come from the normal usage and quota files that Muse agent runs save. The page joins each login to its cost through the account grouping of the report.
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

## Web routes

The routes are TanStack Router file routes under `apps/web/src/routes/`.

| route | file | page |
|---|---|---|
| `/` | `index.tsx` | a replace redirect to `/needs-you` |
| `/needs-you` | `needs-you/route.tsx` | human review tickets and personal mentions across every project |
| `/all` | `all/route.tsx` | every ticket as a board |
| `/all/table` | `all_.table.tsx` | every ticket as a table |
| `/p/$` | `p/$/route.tsx` | a project as a board, a table, or its settings |
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
The gap is 12 px on desktop and 8 px on a phone. Back to list restores the
last list URL with its filters.

`/p/$` takes one splat, `[key, ...slugs, view?]`. The URL keeps slashes and the
API ref joins the same segments with dots, so `/p/CDE/web/auth` reads
`CDE.web.auth`. The last segment is a view only when it is a reserved slug:
`table`, `settings`, or `board`. A `CHECK` on `projects.slug` refuses `board` and
`settings`, so a sub-project never takes one of those names.

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

The sidebar holds the workspace row, Needs you, Search, All tickets, Pull
requests, Flows, Usage, the sessions, the project tree, and the actor footer.
The sessions and the project tree share the one region that scrolls, so the fixed
links keep their place at any height.
The global Sessions section lists sessions without a project. Its New session button opens a dialog with project, harness, model, effort, and account choices.
The dialog accepts a prompt, files, and an optional name. A project also has a Sessions page with a secondary sidebar for all its agents.
Unsent text and files stay available when the user changes sessions.
Each session row opens its conversation. The conversation controls can stop, resume, or delete the session.
Each project row shows the Trellis mark and project name. Tickets, Sessions, and Settings appear below it.
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
| projects | id PK, parent_id, root_id, key (UNIQUE, CHECK regex), slug (CHECK slug regex, not `board` or `settings`), name (1 to 120), description, directory, ticket_template, ticket_counter, position, archived_at, created_at, updated_at. UNIQUE (id, root_id). FK (parent_id, root_id). UNIQUE NULLS NOT DISTINCT (parent_id, slug). CHECK `(parent_id IS NULL) = (root_id = id)`, `(parent_id IS NULL) = (key IS NOT NULL)`, `parent_id <> id`, `parent_id IS NULL OR ticket_counter = 0`. Index (root_id). |
| repos | id PK, project_id (CASCADE), owner, repo (both CHECK lowercase). UNIQUE (project_id, owner, repo). The effective repos of a project are its own plus those of its ancestors. |
| statuses | id PK, project_id (CASCADE), name (1 to 40), description (CHECK <= 2000), slug, category (CHECK set), reviewer (CHECK `(category = 'review') = (reviewer IS NOT NULL)`), color, position, is_default, created_at, updated_at. UNIQUE (project_id, name) and (project_id, slug). Partial UNIQUE (project_id) WHERE is_default. |
| tickets | id PK, project_id, root_id, number (CHECK > 0), title (CHECK trimmed, 1 to 500), description, priority (CHECK set), status_id (FK statuses RESTRICT), parent_id, position double, version, started_at, completed_at, search tsvector GENERATED (title A, description B), created_at, updated_at. UNIQUE (root_id, number) and (id, root_id). FK (project_id, root_id) RESTRICT and FK (parent_id, root_id) RESTRICT. Indexes (project_id, status_id, position), (status_id, position, id, project_id, root_id), (parent_id), partial (root_id, updated_at DESC) WHERE completed_at IS NULL, partial (root_id, completed_at DESC) WHERE completed_at IS NOT NULL, GIN (search), GIN (title gin_trgm_ops). |
| comments | id PK, ticket_id (CASCADE), body (1 to 200000), parent_id, resolved_at, actor_name, actor_kind, search tsvector GENERATED (body C), created_at, updated_at. FK to actors. UNIQUE (id, ticket_id). FK (parent_id, ticket_id) CASCADE, so a reply stays on the ticket of its root. CHECK `parent_id <> id` and `parent_id IS NULL OR resolved_at IS NULL`, so only a root carries the resolved mark. Index (ticket_id, created_at) and (parent_id). GIN (search). |
| attachments | id PK, ticket_id (CASCADE), filename (1 to 255, no `/`), mime, size (CHECK > 0), sha256 (CHECK hex 64), actor_name, actor_kind, created_at. FK to actors. Index (ticket_id) and (sha256). |
| pull_requests | id PK, owner, repo (CHECK lowercase), number (CHECK > 0), url, title, state, is_draft, head_ref, base_ref, review_state, merged_at, closed_at, checks jsonb (CHECK array), ci_state, content_hash, fetched_at, fetch_error, created_at, updated_at. UNIQUE (owner, repo, number). Index (state, ci_state). |
| ticket_pull_requests | ticket_id (CASCADE), pull_request_id (CASCADE), source (manual), actor_name, actor_kind, created_at. PK (ticket_id, pull_request_id). Index (pull_request_id). |
| activity | id bigint IDENTITY PK, batch_id, root_id (CASCADE), project_id (CASCADE), ticket_id (CASCADE), actor_name, actor_kind, action, field, from_value, to_value, meta jsonb, created_at. FK to actors. CHECK `field <> 'description' OR (from_value IS NULL AND to_value IS NULL)`. Indexes (ticket_id, id), (ticket_id, created_at DESC, id DESC), (root_id, id), (project_id, id), (created_at). |
| actors | name (CHECK 1 to 64, no `:`), kind (human, agent, or system), first_seen_at, last_seen_at. PK (name, kind). |
| settings | key PK, value jsonb, updated_at. |
| flows | id PK, slug (UNIQUE, CHECK slug regex, 64 at most), name (1 to 120), description (CHECK <= 2000), briefing (CHECK <= 200000), version (CHECK > 0), created_at, updated_at. |
| flow_nodes | id PK, flow_id (CASCADE), parent_id, kind (CHECK agent, gate, human, group, or loop), title (0 to 120), instruction (CHECK <= 200000), parallel (boolean, group only), minutes (optional, group only, 1 to 1440), max_rounds (CHECK `(kind = 'loop') = (max_rounds IS NOT NULL)`, 1 to 50), x, y, width, height (CHECK >= 40). UNIQUE (id, flow_id). FK (parent_id, flow_id) CASCADE, so a group and the nodes inside it stay in one flow. Index (flow_id). |
| flow_edges | id PK, flow_id (CASCADE), from_node_id, to_node_id, branch (CHECK out, yes, or no). FK (from_node_id, flow_id) and FK (to_node_id, flow_id) to flow_nodes CASCADE. UNIQUE (from_node_id, branch, to_node_id). CHECK `from_node_id <> to_node_id`. Indexes (flow_id) and (to_node_id). |
| harness_accounts | id PK, name, harness, profile_path, is_default, enabled, archived_at, created_at, updated_at. Partial UNIQUE (harness, profile_path) for current accounts. Partial UNIQUE (harness) for current default accounts. |
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

The schema migrations live in `apps/server/drizzle/`, through `0072_sticky_mockingbird`.
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
child counts, the comment and attachment counts, the pull request rollup, the
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
`statuses.changed {projectId}`,
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
attachments, board, command, composer, filters, needs-you, pickers,
project-actions, project-settings, prs, search, settings, setup,
shell, sidebar, table, ticket), `components/`, `hooks/`, `lib/`, and `stores/`.

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
