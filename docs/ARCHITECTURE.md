# Architecture

trellis is a local ticket tracker for work that humans give to coding agents.
One server on the machine owns all data. The web app, the mobile app, and the
CLI reach that server over HTTP. The server has no authentication and binds
`127.0.0.1` by default. Read [SECURITY.md](../SECURITY.md) for the security
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
| Fonts | BerkeleyMono, then JetBrains Mono from fontsource | 5.3 |
| Mobile | Expo, expo-router, React Native, NativeWind, FlashList, `expo-sqlite/kv-store`, `react-native-sse` | 57, 0.86, current |
| Agent runner | the Superset CLI, or tmux for a template without `{{superset}}` | |
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
│   └── mobile/   @trellis/mobile   Expo app
├── packages/
│   ├── api/      @trellis/api      Zod schemas, refs, errors, contract, client, events, query keys
│   ├── ui/       @trellis/ui       design tokens, Base UI wrappers, visual primitives
│   └── cli/      @trellis/cli      the `trellis` command, HTTP only
├── docs/                           this reference, the agent setup guide, the diagram
├── scripts/                        the `bun run check` runner
└── test/                           the repository rules and the documentation links
```

The dependency graph is a star. Server, web, mobile, and CLI import `api`. The
CLI imports the contract as a type only. Only web imports `ui`. Each package
exports TypeScript source and has no side effects.

The data home is `~/.trellis`, and `TRELLIS_HOME` overrides it. It holds `db/`,
`attachments/`, `backups/`, `agents/`, and `server.log`. The log rotates at 10 MB
and keeps five files. `agents/<run id>/` holds the launch script, the workspace
of a ticket agent under `work/`, and `output.txt` after a stop. The port is 4521
(`TRELLIS_PORT`) and the host is `127.0.0.1` (`TRELLIS_HOST`).

## Domain rules

Personas are local records shared across projects. Each persona has a name and
an instruction, and a kind: builder, reviewer, or manager. The AI section of the
sidebar opens the Personas page at `/ai/personas`, with cards grouped by kind and
a slideout to create, edit, and delete these records. The API exposes
`personas.list`, `personas.create`, `personas.update`, and `personas.delete`.
There is no route that reads one persona, so a client reads the list and matches
on the id or the name. `personas.list` sorts by name, then id. The
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
- Priority is none, urgent, high, medium, or low. There are no labels. A ticket carries as many active agents as the concurrency limit of its project allows.
- Every non-GET request sends the header `x-trellis-actor: <human|agent>:<name>`. The name is printable ASCII without a colon, 1 to 64 characters.
- A missing header is `ACTOR_REQUIRED` and a malformed one is `ACTOR_INVALID`. A GET ignores the header. The header rejects the kind `system`, which trellis reserves for `system:trellis`.
- The optional header `x-trellis-session` is stored in `activity.meta.session`. trellis stores the name and the kind of an actor, and nothing else.
- The service enforces the agent policy, so curl obeys it too. An agent cannot move a ticket to a done status (`AGENT_CANNOT_COMPLETE`, 403) and cannot delete a ticket or a project (`AGENT_CANNOT_DELETE`, 403) without `force`.
- An archived project serves reads. Every mutation on it fails with `PROJECT_ARCHIVED`.
- `tickets.version` rises on every row change. `update` and `move` accept `expectedVersion` or the header `If-Match`. A mismatch is `VERSION_CONFLICT` (412) with the current row.
- `updated_at` moves only on user-visible activity: a ticket field, a comment, an attachment, or a pull request link. A reorder, a remap, and a poller CI change raise `version` only.
- A delete is a hard delete. A ticket delete nulls the `parent_id` of its children, then cascades comments, attachments, pull request links, and activity. The blob collector then removes unused files.
- A project delete needs an empty subtree or `force`.

### Agent runs

An agent run is one agent that trellis started from a persona. `agentRuns`
exposes list, start, stop, refresh, send, and output. The ticket rail lists the
runs of the ticket and opens a searchable persona picker; the picker puts the
five personas the project used most first, and hides the manager kind. Each
project has a Manager page at `/p/<project path>/settings/manager`. Its header
holds the agents switch and the Start manager button. Its Status section picks
the manager persona, opens the manager, reads its output, sends it a follow-up,
and stops it. Its ADE section picks the Agentic Development Environment, its
command template, the Superset host, the concurrency limit, and the project
directory. Those seven fields are `projects.managerConfig`.

A run copies the persona name, the kind, and the instruction at launch, so a
later persona edit changes only the runs after it. The row also keeps the project
path and the ticket identifier, so a delete of either leaves the run readable.
A run state is `starting`, `running`, `interrupted`, `failed`, `stopped`, or
`exited`. A failed launch stays visible with its error. Stop closes the terminal
of the run, writes the terminal text to `agents/<id>/output.txt`, and keeps the
workspace and the history.

A start needs a persona whose kind matches the target: a manager takes a project,
and a builder or a reviewer takes a ticket. A start refuses a project whose agents
switch is off, a completed ticket, a project with no repository, and a second
live manager for the same project. A ticket start counts the active non-manager
runs of the project and refuses at the concurrency limit. The limit runs from 1 to 64 and defaults to 3. The manager is
outside that count. A partial unique index on `agent_runs` holds the one-manager
rule in the database.

A project picks its Agentic Development Environment in `managerConfig.ade`. The
value `superset` takes the machine template, `settings.agentLaunchCommand`. The
value `custom` takes `managerConfig.adeCommand`, and an empty project command
falls back to the machine template. The default machine template is
`{{superset}} ws create {{target}} --project {{projectId}} --name {{name}}
--branch {{branch}} --command {{agentCommand}} --json`. The template variables are
`{{superset}}`, `{{target}}`, `{{workDir}}`, `{{projectDir}}`, `{{concurrency}}`,
`{{projectId}}`, `{{project}}`, `{{ticket}}`, `{{name}}`, `{{branch}}`,
`{{instruction}}`, `{{prompt}}`, `{{actor}}`, `{{trellisUrl}}`, and
`{{agentCommand}}`. An unknown variable fails the save, and so does a standalone
hyphen beside `{{superset}}`. The expander wraps each value in single quotes, so
one value is one shell argument. `{{target}}` is the Superset host flag of the
project: `--local` for a null `supersetHostId`, and `--host '<id>'` otherwise.

`{{prompt}}` is the instruction of the run plus an assignment block: the agent
name, the actor `agent:<run id>`, the trellis URL, the persona, the ticket or the
project, the concurrency limit, the project directory, and the repositories.
`{{agentCommand}}` wraps that prompt: it runs `exec env TRELLIS_URL=...
TRELLIS_ACTOR=... claude -n <name> <prompt>`, with a `cd` into the project
directory for a manager. `launchCommand.ts` is the one place that builds it. The
runner-driven agent manager takes the other path in
`packages/api/src/instructions/agentLaunch.ts`, whose command reads its prompt at
start time with `trellis instructions --role`.

A template that holds `{{superset}}` gives the run the runtime `superset` and
creates a Superset workspace. A template without it gives the run the runtime
`tmux`: the server writes `agents/<id>/launch.sh` with mode 0700 and starts a
detached session on a private tmux socket in the temp directory, keyed by a hash
of the data home. That session survives a restart of the trellis server.

The Needs you page holds four sections in a fixed order: review, failing CI,
stalled, and done today. It reads `inbox.get` once with no project filter, and
every section reads its rows from that one entry. The empty state shows only when
every section is empty. Ticket status changes use the status picker.

### The agent manager

`agent_sessions` is the second agent path, which the runner drives. A session
carries a role of manager, builder, or reviewer, a runner, a state, a person
name, and the terminal it runs in. A project holds one live manager, which a
partial unique index enforces. `agents.inbox` is a POST, because it moves the
stored cursor of the project in the transaction that reads the rows after it. The
`agents.session` and `agents.batch` events carry the changed row and the count the
dispatcher woke a manager for.

## Web routes

The routes are TanStack Router file routes under `apps/web/src/routes/`.

| route | file | page |
|---|---|---|
| `/` | `index.tsx` | a replace redirect to `/needs-you` |
| `/needs-you` | `needs-you/route.tsx` | review, failing CI, stalled, and done today |
| `/all` | `all/route.tsx` | every ticket as a board |
| `/all/table` | `all_.table.tsx` | every ticket as a table |
| `/p/$` | `p/$/route.tsx` | a project as a board, a table, its settings, or its manager |
| `/t/$identifier` | `t/$identifier/route.tsx` | one ticket |
| `/search` | `search.tsx` | search |
| `/ai/personas` | `ai.personas.tsx` | the personas |
| `/settings` | `settings.tsx` | the settings |
| `/setup` | `setup.tsx` | the first visit, and the new project step |
| `/_gallery` | `[_]gallery.tsx` | every primitive in every state, in both themes |

`/p/$` takes one splat, `[key, ...slugs, view?]`. The URL keeps slashes and the
API ref joins the same segments with dots, so `/p/CDE/web/auth` reads
`CDE.web.auth`. The last segment is a view only when it is a reserved slug:
`table`, `settings`, or `board`. A `CHECK` on `projects.slug` refuses `board` and
`settings`, so a sub-project never takes one of those names.

The board is the view a project opens in and writes no segment. An older link
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
| `/settings` | Account (no hash), `#agents`, `#integrations` |
| `/p/<path>/settings` | General (no hash), `#template`, `#statuses`, `#repositories`, `#subprojects`, `#archive` |
| `/p/<path>/settings/manager` | Status (no hash), `#ade`, `#repositories` |

`/settings` holds what is true for the whole machine: the actor name, the theme,
the machine launch command, the stalled threshold, the gh state, the diff URL
template, and the phone pair code. Every agent setting of one project lives on
that project's Manager page: its agents switch, its manager persona, its ADE, its
ADE command, its Superset host, its concurrency limit, and its project directory.
`projects.managerConfig` carries those seven fields, and the Manager page writes
them through `projects.update`.

The sidebar holds the workspace row, Needs you, Search, All tickets, the project
tree, the AI section with the Personas link, and the actor footer. The project
tree is the one region that scrolls, so the Personas link keeps its place at any
tree height.

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
| projects | id PK, parent_id, root_id, key (UNIQUE, CHECK regex), slug (CHECK slug regex, not `board` or `settings`), name (1 to 120), description, manager_config jsonb (`personaId`, `concurrency`, `directory`, `enabled`, `supersetHostId`, `ade`, `adeCommand`), ticket_template, ticket_counter, position, archived_at, created_at, updated_at. UNIQUE (id, root_id). FK (parent_id, root_id). UNIQUE NULLS NOT DISTINCT (parent_id, slug). CHECK `(parent_id IS NULL) = (root_id = id)`, `(parent_id IS NULL) = (key IS NOT NULL)`, `parent_id <> id`, `parent_id IS NULL OR ticket_counter = 0`. Index (root_id). |
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
| agent_runs | id PK, name, runtime (default `superset`), persona_id (FK personas SET NULL), persona_name, kind (CHECK the three persona kinds), instruction, project_id (SET NULL), project_path, ticket_id (SET NULL), ticket_identifier, state (CHECK starting, interrupted, running, failed, stopped, exited), workspace_id, terminal_id, url, error, created_at, updated_at. Partial index (ticket_id) WHERE the state is live. Partial UNIQUE (project_id) WHERE `kind = 'manager'` AND the state is live. Index (created_at). |
| agent_sessions | id PK, project_id (CASCADE), ticket_id (CASCADE), role (CHECK manager, builder, reviewer), runner (CHECK superset), state (CHECK starting, running, waiting, exited, stopped, failed), workspace_id, terminal_id, claude_session_id, name (1 to 40), title (1 to 120), open_url, last_woken_at, error, created_at, updated_at. CHECK `(role = 'manager') = (ticket_id IS NULL)`. Indexes (project_id, role, state) and (ticket_id). Partial UNIQUE (project_id) WHERE the role is manager and the state is live. Partial UNIQUE (workspace_id, terminal_id) WHERE both are set. |
| agent_cursors | project_id PK (CASCADE), activity_id bigint, updated_at. The last activity row the manager of the project read through `agents.inbox`. |

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

The migrations live in `apps/server/drizzle/`, from `0000_extensions` to
`0022_fix_manager_launch`. `0000_extensions` creates `pg_trgm`. `0001_init` holds
the tables. `0002_constraints` holds what drizzle-kit cannot render: the
`UNIQUE NULLS NOT DISTINCT` constraint, the generated `tsvector` columns, and the
trigram index. The migrator applies them at boot in one transaction, then runs
`ANALYZE` and sets `pg_trgm.word_similarity_threshold`. `meta/_journal.json` is
the order the migrator runs, and it lists 20 entries: the numbers 0009 to 0011
are absent, because those migrations left the tree before release.
`0013_remove_agents` drops the agent manager tables and `0020_restore_agents`
brings them back, so a data home from that window still upgrades. CI fails when
`drizzle-kit generate` leaves a change under `apps/server/drizzle/`.

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
| projects.list | GET /api/projects | flat list with path, depth, open count, and needs-you count |
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
| personas.list, create, update, delete | GET, POST /api/personas; PATCH, DELETE /api/personas/{id} | no route reads one persona |
| agentRuns.list, start | GET, POST /api/agent-runs | start answers 201 with the row in any state |
| agentRuns.stop, refresh, send | POST /api/agent-runs/{id}/stop, /refresh, /send | send takes 1 to 20000 characters |
| agentRuns.output | GET /api/agent-runs/{id}/output | the terminal text as `{text}` |
| agents.sessions, overview | GET /api/agents/sessions, /api/agents/overview | the runner-driven agent manager |
| agents.inbox | POST /api/agents/inbox | it moves the manager cursor, so it is a POST |
| agents.register, startBuilder, startReviewer, stop, wake, retryManager | POST /api/agents/register, /builder, /reviewer, /sessions/{id}/stop, /wake, /manager/retry | |
| agents.settings, setSettings | GET, PUT /api/agents/settings | |
| agents.runnerProjects, runnerHosts | GET /api/agents/runner-projects, /api/agents/runner-hosts | they throw GH-style `RUNNER_UNAVAILABLE` |
| search.query | GET /api/search | tickets and projects |
| inbox.get | GET /api/inbox | `{review, failingCi, stalled, doneByAgentsToday}` |
| brief.get | GET /api/tickets/{ticket}/brief | the markdown brief an agent starts from |
| actors.list, default | GET /api/actors, /api/actors/default | |
| settings.get, set | GET, PUT /api/settings | |
| system.health, gh, backup | GET /api/health, /api/gh; POST /api/backup | |
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
AGENT_CANNOT_COMPLETE 403, AGENT_CANNOT_DELETE 403, NOT_FOUND 404, DUPLICATE
409, KEY_LOCKED 409, STATUS_NOT_IN_PROJECT 409, STATUS_IN_USE 409, LAST_STATUS
409, ROOT_STATUSES 409, STATUS_CATEGORY_IMMUTABLE 409, CROSS_ROOT_MOVE 409,
PARENT_CYCLE 409, PROJECT_NOT_EMPTY 409, PROJECT_ARCHIVED 409,
COMMENT_PARENT_MISMATCH 409, COMMENT_HAS_REPLIES 409, INVALID_ANCHOR 409,
CONCURRENCY_LIMIT 409, VERSION_CONFLICT 412, PAYLOAD_TOO_LARGE 413,
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
`personas.changed {id}`, `agent-runs.changed {id}`,
`agents.session {session}`, and `agents.batch {projectId, count}`.
`packages/api/src/events.ts` holds the one list of names, and the `types=`
parameter takes a name or a `prefix.*` form.

The client rule is patch first and invalidate rarely, in
`packages/api/src/query-keys.ts`. A `ticket.*` event patches every cached list,
board, inbox, search, and detail entry that holds the id. A patch applies per
entry only when `incoming.version > entry.version`, and then sets the entry
version. A queued or in-flight refetch never blocks a patch.

A detail entry whose event fields include `description` keeps its old text and
gains `descriptionStale`. The coalescer then invalidates it, and the refetch
clears the flag. The description editor refuses to save while the flag is set.
While a mutation for an id is in flight, patches queue and apply in version
order after it settles.

Invalidation happens only when membership or order can change: status, project,
priority, parent, completed, create, and delete. It runs through a coalescer
with a 250 ms trailing delay and a 1 s maximum. Inbox invalidation is debounced
by 1 s. A mutation writes its response with `setQueryData` and invalidates on an
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
| Ticket open | 50 ms summary and 100 ms body from cache | e2e/peek |
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
`schemas/`, `contract/`, `agentLaunch/` (the launch template and its variables),
`instructions.ts` (the `AGENTS.md` block), and `instructions/` (the manager,
builder, and reviewer prompts, and the agent names).

`apps/server` holds `index.ts` (boot), `config.ts`, `log.ts`, `app.ts`,
`context.ts`, `db/` (worker, transport, client, migrate, schema, tables, enums,
tx, cache, maintenance, queries), `services/`, `procedures/`, `routes/`,
`events/bus.ts`, `gh/`, `agents/` (the launch command, the Superset runner, and
the managed tmux terminal), and `storage/blobs.ts`.

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
test set, and every other gh call reaches the gh stub. The Superset runner
answers from a stub binary, so a test drives a real agent start.

The end-to-end suite covers the agent failure page, the dispatch path, and the
pair link, beside the ticket, board, table, and live paths.

## UI system

`packages/ui` owns every visual. Base UI gives behavior and accessibility. There
is no shadcn and no Radix.

- Type: two typefaces carry the interface. `--sans` is Inter Variable, then a metric-matched Arial fallback, and it sets the prose: labels, buttons, menus, descriptions, and comments. `--mono` is BerkeleyMono, then JetBrains Mono, then a metric-matched local fallback, and it sets ticket ids through `font-mono`, plus code blocks and raw terminal output. The build preloads Inter and JetBrains Mono 400 only. BerkeleyMono is licensed per machine, so the repo ships no file for it and declares no face. A machine without it falls through to JetBrains Mono from fontsource, in the latin subset and the weights 400, 500, and 600. `tnum` lines up ids, counts, and times.
- The type scale is 11, 12, 13, 14, 16, 20, and 24 px, plus the two micro steps `text-kbd` at 10 px and `text-initials` at 9 px.
- Spacing has a 4 px base. Every radius token is 0 px, so controls and surfaces have square corners, including avatars, badges, and switch thumbs.
- The tokens carry a light and a dark palette in `tokens.css`. Every neutral is one seed grey mixed with white or with black, and a step keeps its position in the ramp across the two themes. The light `--success`, `--warning`, and `--danger` are dark enough for 4.5:1 on their own soft grounds. `tokens.test.ts` computes the ratio of every text and ground pair, and pins every value in the file, so Biome skips it.
- The bare `:root` block is the light palette. A media block serves the system preference and a `data-theme` block serves an explicit choice. A fresh profile starts dark: an inline head script reads `trellis-theme` from local storage, writes `dark` when the key is absent, and stamps `data-theme` before the first paint.
- Dark mode swaps every shadow for a 1 px strong border.
- `--accent` is the interface blue and `--agent` is the agent purple. Each one has a `-soft` ground.
- Status by category: todo is a faint empty circle, started is a warning half ring, review is an accent dotted ring, done is a success filled check, and canceled is a faint cross.
- Priority uses bars in `fg-muted`. Urgent is a filled danger square.
- Motion durations: 120 ms hover, 160 ms popover, 240 ms peek slide, 160 ms row enter, and 200 ms ribbon sweep.
- Never animate a re-sort, a text change, a counter, a skeleton swap, or the theme switch. Use `motion/mini` and CSS transitions only.
- Focus uses a 2 px accent outline on `:focus-visible`. A row or a card uses an inset left bar.
- The primitives are Avatar, Badge, Button, Checkbox, Chip, Command, ConfirmDialog, Dialog, EmptyState, EntityCard, IconButton, Input, Kbd, Menu, Popover, ScrollArea, SectionHeader, Segmented, Select, Separator, Sheet, Skeleton, Spinner, Switch, Tabs, Textarea, Toast, and Tooltip.
- The domain visuals are StatusIcon, PriorityIcon, CheckRibbon, ActorChip, TicketId, and TrellisMark.
- The route `/_gallery` renders every primitive in every state, in both themes.
- No raw color or spacing literal appears outside `packages/ui`. The Tailwind theme clears `--color-*`, so a utility such as `bg-red-500` does not exist. A Biome rule and a test enforce the tokens.

Every UI item passes the design checklist: optical alignment, tabular numbers,
hover, active, focus and disabled states, no layout shift when data arrives, hit
areas of 28 px on desktop and 44 px on mobile, contrast, density, motion
durations from the token table, reduced motion, and empty, loading, and error
states.
