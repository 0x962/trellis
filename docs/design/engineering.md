# Trellis engineering design

trellis is a local ticket tracker for one engineer and the agents that do the engineer's tickets. This document sets the architecture. Each section ends with one decision.

---

## 1. Repo layout

```
trellis/
├── package.json              workspaces: ["apps/*", "packages/*"]; root scripts below
├── turbo.json
├── biome.json                single config, root-level; packages have none
├── tsconfig.base.json        strict, module=preserve, moduleResolution=bundler, verbatimModuleSyntax
├── bunfig.toml               [test] preload = ["./test/preload.ts"] (sets TRELLIS_HOME to a tmp dir)
├── LICENSE                   MIT
├── README.md  CONTRIBUTING.md  CHANGELOG.md
├── .changeset/
├── .github/workflows/ci.yml  + ISSUE_TEMPLATE/{bug.yml,feature.yml}, PULL_REQUEST_TEMPLATE.md
├── apps/
│   ├── server/   @trellis/server   Bun + Hono + oRPC handlers + PGlite/Drizzle + poller
│   ├── web/      @trellis/web      React 19 + Vite 8 + TanStack Router/Query + Tailwind v4 + shadcn
│   └── mobile/   @trellis/mobile   Expo 57 + expo-router
└── packages/
    ├── api/      @trellis/api      Zod 4 schemas, oRPC *contract*, client factory, event types, query-key helpers
    └── cli/      @trellis/cli      the `trellis` command (citty), HTTP-only
```

**Why the contract lives in `packages/api`, not the server.** We use oRPC contract-first (`@orpc/contract`). `packages/api` defines `contract` (routes, zod input/output, typed errors) and `createTrellisClient(baseUrl, actor)`. The server calls `implement(contract)`. Thus web, mobile, and the CLI depend on `@trellis/api` only and never import server code. The dependency graph is a star, and `bun test` in `packages/cli` never loads Postgres types.

**Dependency graph** (workspace → workspace):

```
@trellis/api      ← @trellis/server, @trellis/web, @trellis/mobile, @trellis/cli
@trellis/server   ← (nothing; e2e tests start it as a process)
```

Packages export TypeScript source directly (`"exports": { ".": "./src/index.ts" }`). `packages/*` have no build step. Only `apps/web` (Vite) and `apps/server` (for the compiled binary) have `build`.

**turbo.json tasks**

| task | dependsOn | cache | outputs | notes |
|---|---|---|---|---|
| `dev` | | false | | `persistent: true`; mobile task also `interactive: true` |
| `build` | `^build` | true | `dist/**` | web: `vite build`; server: `bun build --compile` (M5+); others no-op |
| `test` | | true | | `bun test` in every workspace |
| `typecheck` | | true | | `tsc --noEmit` (TS 7 native binary) per workspace |
| `lint` | | true | | `biome check .` per workspace, root `biome.json` applies |
| `db:generate` | | false | `drizzle/**` | server only: `drizzle-kit generate` |

**Root scripts**

```
dev         turbo run dev --filter=@trellis/server --filter=@trellis/web
dev:all     turbo run dev            (adds mobile; Expo runs interactive in turbo's TUI)
build       turbo run build
test        turbo run test
typecheck   turbo run typecheck
lint        biome check .            (root, fast path)  /  lint:fix  biome check --write .
check       turbo run lint typecheck test
db:generate turbo run db:generate --filter=@trellis/server
e2e         bun run --cwd apps/web e2e
release     changeset version && bun install && changeset tag
```

`bun dev` runs the server on 4521 and Vite on 5173. `TRELLIS_HOME` defaults to `~/.trellis`. Vite proxies `/api` and `/rpc` to 4521. The turbo TUI gives one pane to each app.

---

## 2. Database schema

Dialect: Postgres through `drizzle-orm/pglite`. Ids are ULIDs (`text`, 26 chars). The app makes them with the `ulid` package. ULIDs are sortable and need no sequence, so the app can make one before the insert. Timestamps are `timestamptz` with `default now()`. All tables are in `apps/server/src/db/schema.ts`. The enums are in `apps/server/src/db/enums.ts`.

**Enums**: `priority` (none|urgent|high|medium|low), `status_category` (todo|started|review|done|canceled), `actor_kind` (human|agent), `pr_state` (open|closed|merged), `ci_state` (none|pending|pass|fail).

### projects
| column | type | constraints |
|---|---|---|
| id | text PK | ulid |
| parent_id | text | FK projects.id ON DELETE RESTRICT, null for roots |
| root_id | text NOT NULL | FK projects.id; equals `id` for roots; immutable |
| key | text | UNIQUE; CHECK `key ~ '^[A-Z][A-Z0-9]{1,9}$'`; CHECK `(parent_id IS NULL) = (key IS NOT NULL)` |
| name | text NOT NULL | |
| description | text NOT NULL DEFAULT '' | markdown |
| ticket_counter | integer NOT NULL DEFAULT 0 | used on roots only |
| position | integer NOT NULL DEFAULT 0 | sibling order |
| archived_at | timestamptz | |
| created_at, updated_at | timestamptz NOT NULL | |

Indexes: `(parent_id)`, `(root_id)`. A project can move to a new parent in the same root only. A move to a different root fails with `CROSS_ROOT_MOVE`. Thus `root_id` never changes.

### repos
| column | type | constraints |
|---|---|---|
| id | text PK | |
| project_id | text NOT NULL | FK projects ON DELETE CASCADE |
| owner, repo | text NOT NULL | |
| created_at | timestamptz | |

UNIQUE `(project_id, owner, repo)`. The *effective repos* of a ticket are the repos of its project and of all its ancestors.

### statuses
| column | type | constraints |
|---|---|---|
| id | text PK | |
| project_id | text NOT NULL | FK projects ON DELETE CASCADE |
| name | text NOT NULL | |
| category | status_category NOT NULL | |
| color | text | hex, optional |
| position | integer NOT NULL | |
| created_at | timestamptz | |

UNIQUE `(project_id, name)`, INDEX `(project_id, position)`. When the service creates a root project, it adds these statuses (name/category):

- Todo/todo
- In Progress/started
- Agent Review/review
- Human Review/review
- Done/done
- Canceled/canceled

A root must keep at least one status. The service refuses the delete of the last status with `LAST_STATUS`.

**Inheritance rule as a query** (`db/queries/effectiveStatuses.ts`): go up from the project, and use the first level that owns statuses.

```sql
WITH RECURSIVE chain AS (
  SELECT id, parent_id, 0 AS depth FROM projects WHERE id = $1
  UNION ALL
  SELECT p.id, p.parent_id, c.depth + 1 FROM projects p JOIN chain c ON p.id = c.parent_id
), owner AS (
  SELECT c.id FROM chain c WHERE EXISTS (SELECT 1 FROM statuses s WHERE s.project_id = c.id)
  ORDER BY c.depth LIMIT 1
)
SELECT s.*, (SELECT id FROM owner) AS inherited_from
FROM statuses s WHERE s.project_id = (SELECT id FROM owner) ORDER BY s.position;
```

A root always owns statuses, so `owner` is never empty. A sub-project that inherits its statuses can create its first own status (`statuses.create`). In that case, the service copies the effective set into the sub-project, and then adds the new status. Both steps occur in one transaction. The tickets in that subtree then point at the copies. The service remaps them by name, then by category.

`statuses.clear` deletes the status set of the sub-project. It remaps the subtree tickets to the effective set of the parent, by name and then by category. Each remap writes an activity row.

### tickets
| column | type | constraints |
|---|---|---|
| id | text PK | |
| project_id | text NOT NULL | FK projects ON DELETE RESTRICT |
| root_id | text NOT NULL | FK projects; denormalized from project |
| number | integer NOT NULL | |
| title | text NOT NULL | CHECK length ≤ 500 |
| description | text NOT NULL DEFAULT '' | markdown |
| priority | priority NOT NULL DEFAULT 'none' | |
| status_id | text NOT NULL | FK statuses ON DELETE RESTRICT |
| parent_id | text | FK tickets ON DELETE SET NULL |
| position | double precision NOT NULL | order inside a status column |
| started_at, completed_at | timestamptz | set/cleared by category transitions (started_at on first started/review; completed_at on done/canceled) |
| search | tsvector GENERATED ALWAYS AS (`setweight(to_tsvector('english', title),'A') \|\| setweight(to_tsvector('english', description),'B')`) STORED | |
| created_at, updated_at | timestamptz NOT NULL | |

Indexes: UNIQUE `(root_id, number)`; `(project_id, status_id)`; `(status_id, position)`; `(parent_id)`; `(updated_at DESC)`; GIN `(search)`; GIN `(title gin_trgm_ops)`.

The database does not store the identifier `CDE-42`. A join on `root_id` makes it: `root.key || '-' || number`. Thus a new key changes the identifier of every ticket in the root. We want this result. The path `CDE-42` → `(key, number)` → `(root_id, number)` is one indexed lookup.

**Ticket numbering** (`services/tickets.ts#create`): one transaction runs `UPDATE projects SET ticket_counter = ticket_counter + 1 WHERE id = $root RETURNING ticket_counter`, and then inserts the ticket with that number. The row lock puts the number allocations in series. A rolled-back transaction leaves a gap in the numbers. We accept the gap.

The PGlite driver of Drizzle sends `db.transaction()` to `PGlite.transaction()`. That call holds the instance mutex, so the statements of two transactions cannot interleave. A test asserts that 50 concurrent `create` calls give 50 distinct consecutive numbers.

**Kanban position**: a new ticket gets `max(position in status) + 1024`. A move sets the midpoint between the two adjacent tickets. If the gap falls below 1e-6, the service renumbers the column in steps of 1024, in the same transaction. With double precision, one sentence explains the full scheme.

### comments
| column | type | constraints |
|---|---|---|
| id | text PK | |
| ticket_id | text NOT NULL | FK tickets ON DELETE CASCADE |
| body | text NOT NULL | markdown |
| actor_name | text NOT NULL; actor_kind | actor_kind NOT NULL | |
| created_at, updated_at | timestamptz | |

INDEX `(ticket_id, created_at)`.

### attachments
| column | type | constraints |
|---|---|---|
| id | text PK | ulid; appears in URLs |
| ticket_id | text NOT NULL | FK tickets ON DELETE CASCADE |
| filename | text NOT NULL | original name, path separators stripped |
| mime | text NOT NULL | |
| size | bigint NOT NULL | |
| sha256 | char(64) NOT NULL | |
| path | text NOT NULL | relative to `~/.trellis/attachments`, `ab/abcdef…` |
| actor_name, actor_kind | | |
| created_at | timestamptz | |

INDEX `(ticket_id)`, `(sha256)`. Two rows can share a `sha256`/`path` (dedupe). The service unlinks the file only when it deletes the last row with that hash.

### pull_requests
| column | type | constraints |
|---|---|---|
| id | text PK | |
| ticket_id | text NOT NULL | FK tickets ON DELETE CASCADE |
| owner, repo | text NOT NULL; number integer NOT NULL | |
| url | text NOT NULL | |
| title | text NOT NULL DEFAULT '' | |
| state | pr_state NOT NULL DEFAULT 'open' | |
| is_draft | boolean NOT NULL DEFAULT false | |
| head_ref, base_ref | text | |
| merged_at, closed_at | timestamptz | |
| checks | jsonb NOT NULL DEFAULT '[]' | `[{name, workflow, bucket, link}]` normalized snapshot |
| checks_summary | jsonb NOT NULL DEFAULT '{"pass":0,"fail":0,"pending":0,"skipping":0}' | |
| ci_state | ci_state NOT NULL DEFAULT 'none' | fail if fail>0, else pending if pending>0, else pass if pass>0, else none |
| fetched_at | timestamptz | last successful `gh` fetch |
| fetch_error | text | last error, cleared on success |
| linked_by_name, linked_by_kind | | actor that linked (poller uses `trellis-poller`/agent) |
| created_at, updated_at | timestamptz | |

UNIQUE `(ticket_id, owner, repo, number)`; INDEX `(state, fetched_at)`.

### activity
| column | type | constraints |
|---|---|---|
| id | text PK | ulid (time-ordered, doubles as cursor) |
| batch_id | text NOT NULL | one mutation → one batch; UI groups rows |
| project_id | text NOT NULL | FK projects ON DELETE CASCADE |
| ticket_id | text | FK tickets ON DELETE CASCADE; null for project-level rows |
| actor_name, actor_kind | NOT NULL | |
| action | text NOT NULL | `ticket.created`, `ticket.updated`, `ticket.deleted`, `comment.created/updated/deleted`, `attachment.added/removed`, `pr.linked/unlinked/state_changed`, `status.remapped`, `project.updated` |
| field | text | `title`, `description`, `status`, `priority`, `parent`, `project`, `position`; one row per field |
| from_value, to_value | text | human-readable (status *name*, parent *identifier*); for description, the full old/new text |
| meta | jsonb | ids behind the names, PR url, attachment id |
| created_at | timestamptz | |

INDEX `(ticket_id, id)`, `(project_id, id)`.

### actors
`(name text, kind actor_kind, first_seen_at, last_seen_at)`, PRIMARY KEY `(name, kind)`. Each mutation upserts the actor row. The actor picker and the `trellis whoami` suggestions read this table.

**Delete policy: hard delete.** The reasons: one user, real backups (`trellis backup`), and a `canceled` category for work that went away. A ticket delete does these steps:

- It cascades to comments, attachments, PRs, and activity.
- It sets `parent_id` of the child tickets to null.
- It unlinks the files that no row references.
- It writes one project-level activity row `ticket.deleted` with `meta: {identifier, title}`, so the feed still shows the ticket.

A project delete fails with `PROJECT_NOT_EMPTY` if the project has tickets or children. With `force: true`, it deletes the subtree. The CLI requires `--yes` for both deletes.

**Extensions**: one only, `pg_trgm`, from `@electric-sql/pglite/contrib/pg_trgm`. `db/client.ts` passes it as `new PGlite({ dataDir, extensions: { pg_trgm } })`. Full-text search is part of core Postgres and needs no extension. Migration `0000_extensions.sql` contains `CREATE EXTENSION IF NOT EXISTS pg_trgm;`. `drizzle-kit generate --custom` creates that file. The schema migration `0001_init.sql` comes next.

**Search** (`db/queries/search.ts`) takes `q` and does these steps:

1. If `q` matches `^[A-Z][A-Z0-9]{1,9}-\d+$`, it returns that ticket first.
2. It runs FTS `search @@ websearch_to_tsquery('english', q)`, ranked by `ts_rank`.
3. It adds the trigram matches `title % q` with a union, ranked by `similarity(title, q)`. These matches find typos and prefixes of 2–3 characters. Boot sets `pg_trgm.similarity_threshold` to 0.25.

The result has no duplicates and a limit of 20 rows.

---

## 3. oRPC contract

The contract is in `packages/api/src/contract/*.ts`, with one `oc.route({ method, path })` for each procedure. The zod 4 schemas are in `packages/api/src/schemas/*.ts`. The server mounts `RPCHandler` at `/rpc` for the typed clients: web, mobile, and CLI. It mounts `OpenAPIHandler` at `/api` for curl and agents, with Scalar docs at `/api/docs` and the spec at `/api/openapi.json`. Both handlers serve the same router.

**Actor: a header, `x-trellis-actor: <kind>:<name>`**, for example `agent:claude-code` or `human:navid`. The server splits the value on the first colon. The name can contain all other characters. The reasons for a header:

- The inputs stay pure domain objects. The OpenAPI docs and the CLI flags do not carry a boilerplate field on 25 procedures.
- The CLI resolves the actor once for each process and sets it on the client.
- In curl, the actor is one `-H`.
- The OpenAPI spec declares the header as an `apiKey`-in-header security scheme, so the Scalar "try it" form asks for it.

A mutation without the header fails with `ACTOR_REQUIRED` (400) and the message `Set header x-trellis-actor, e.g. "x-trellis-actor: agent:claude-code"`. A read never needs the header. The web app sends `human:<name>` from localStorage. The first value comes from `actors.default`.

**References**: an input for a ticket takes `ticket: TicketRef` (ULID or `CDE-42`). An input for a project takes `project: ProjectRef` (ULID or `CDE`). `services/refs.ts` resolves the references. An unknown reference gives `NOT_FOUND`.

### Procedures

| resource.procedure | route | input → output |
|---|---|---|
| projects.list | GET /api/projects | `{includeArchived?}` → flat `Project[]` with `parentId, rootId, key, ticketCounts {open, total}` (client builds the tree) |
| projects.get | GET /api/projects/{project} | → `Project & {ancestors, children, repos, statuses, statusesInheritedFrom}` |
| projects.create | POST /api/projects | `{name, key? (required for roots), parent?, description?}` → Project; roots get seeded statuses |
| projects.update | PATCH /api/projects/{project} | `{name?, description?, parent?, position?, archived?}` → Project |
| projects.delete | DELETE /api/projects/{project} | `{force?}` → `{ok}` |
| projects.setRepos | PUT /api/projects/{project}/repos | `{repos: ["owner/repo"]}` → `Repo[]` |
| statuses.list | GET /api/projects/{project}/statuses | → `{statuses, inheritedFrom: projectId \| null}` |
| statuses.create | POST /api/projects/{project}/statuses | `{name, category, color?, position?}` → Status (materialises own set on inheriting sub-projects) |
| statuses.update | PATCH /api/statuses/{id} | `{name?, color?, category?}` → Status |
| statuses.delete | DELETE /api/statuses/{id} | `{moveTicketsTo: statusId}` → `{ok, moved}` |
| statuses.reorder | PUT /api/projects/{project}/statuses/order | `{ids: string[]}` → Status[] |
| statuses.clear | DELETE /api/projects/{project}/statuses | → `{ok, remapped}`; sub-projects only, returns to inheriting |
| tickets.list | GET /api/tickets | see below → `{items: TicketSummary[], nextCursor, total}` |
| tickets.get | GET /api/tickets/{ticket} | → `Ticket & {identifier, status, project {id,key,name}, parent {identifier,title}?, children: TicketSummary[], pullRequests: PullRequest[], attachments: Attachment[]}` |
| tickets.create | POST /api/tickets | `{project, title, description?, priority?, status? (name or id; default first todo), parent?}` → Ticket |
| tickets.update | PATCH /api/tickets/{ticket} | `{title?, description?, priority?, status?, parent? (null clears), project? (same root)}` → Ticket |
| tickets.move | POST /api/tickets/{ticket}/move | `{status, after?: TicketRef, before?: TicketRef}` → Ticket; the kanban drop and `trellis move` |
| tickets.delete | DELETE /api/tickets/{ticket} | → `{ok}` |
| comments.list | GET /api/tickets/{ticket}/comments | `{cursor?, limit?}` → `{items, nextCursor}` (oldest first) |
| comments.create | POST /api/tickets/{ticket}/comments | `{body}` → Comment |
| comments.update | PATCH /api/comments/{id} | `{body}` → Comment |
| comments.delete | DELETE /api/comments/{id} | → `{ok}` |
| attachments.list | GET /api/tickets/{ticket}/attachments | → Attachment[] |
| attachments.upload | POST /api/tickets/{ticket}/attachments | multipart `{file: File}` → `Attachment & {url, markdown}` |
| attachments.get | GET /api/attachments/{id} | → Attachment (metadata; bytes are at `/api/attachments/{id}/file`, a plain Hono route) |
| attachments.delete | DELETE /api/attachments/{id} | → `{ok}` |
| pullRequests.list | GET /api/tickets/{ticket}/prs | → PullRequest[] |
| pullRequests.link | POST /api/tickets/{ticket}/prs | `{url}` → PullRequest (fetched synchronously once; `GH_UNAVAILABLE` if gh cannot run, but the link is still stored with `fetch_error`) |
| pullRequests.unlink | DELETE /api/prs/{id} | → `{ok}` |
| pullRequests.refresh | POST /api/prs/{id}/refresh | → PullRequest (immediate poll) |
| search.query | GET /api/search | `{q, project?, limit?}` → `{tickets: [{identifier, title, status, projectKey, priority}], projects: [{key, name, id}]}` |
| activity.list | GET /api/activity | `{ticket? \| project?, cursor?, limit?}` → `{items: Activity[], nextCursor}` (newest first) |
| actors.list | GET /api/actors | → `{name, kind, lastSeenAt}[]` |
| actors.default | GET /api/actors/default | → `{name, kind:'human'}` from `git config user.name`, else OS username |
| system.health | GET /api/health | → `{ok, version, uptimeSec, home, dbSizeBytes}` |
| system.gh | GET /api/gh | → `{ok, user?, reason?: 'missing'\|'unauthenticated'\|'error', message?, checkedAt}` |
| system.backup | POST /api/backup | `{dest?}` → `{path, bytes}` |
| system.export | GET /api/export | → full JSON document (streamed) |

**`tickets.list` input** (the table, the kanban, and the CLI use it):

```
project?: ProjectRef            includeSubprojects?: boolean = true
filter?: {
  status?: string[]             names or ids, resolved against the project's effective set
  category?: StatusCategory[]
  priority?: Priority[]
  parent?: TicketRef | null     null = top-level only
  hasPr?: boolean               ciState?: CiState[]
  actor?: string                created by (activity ticket.created actor_name)
  q?: string                    FTS, same engine as search
  completedAfter?: ISO date     kanban's Done column uses last 30 days
  updatedAfter?: ISO date
}
sort?: { field: 'updatedAt'|'createdAt'|'priority'|'number'|'status'|'position', dir: 'asc'|'desc' }  default updatedAt desc
cursor?: string   limit?: number = 50 (max 500)
```

The table calls it with its filters and pages by cursor. The kanban calls it with `sort: {field:'position'}`, `limit: 500`, and `filter.completedAfter = now-30d`. The kanban then groups the items by `statusId` on the client. Each item carries `statusId` and `position`, so a drag-and-drop is a `tickets.move` and then an invalidation. `total` is a `count(*)` with the same filter.

**Cursors**: opaque base64url JSON `{v: <sort value>, id}`. From the cursor, the server builds the keyset predicate `(sortcol, id) < (v, id)` again. Every list returns the `{items, nextCursor}` shape. Activity and comments use the ULID `id` alone as the cursor.

**Errors**: the contract declares them with oRPC typed `errors`, so clients get them as a union.

| code | HTTP | when |
|---|---|---|
| ACTOR_REQUIRED | 400 | mutation without header |
| INPUT_VALIDATION_FAILED | 400 | zod (oRPC default; `data.issues` included) |
| INVALID_REF | 400 | `ticket`/`project` not a ULID nor identifier |
| NOT_FOUND | 404 | any ref resolution miss |
| DUPLICATE_KEY | 409 | project key taken |
| STATUS_NOT_IN_PROJECT | 409 | status name/id not in the ticket's effective set; message lists valid names |
| CROSS_ROOT_MOVE | 409 | ticket/project move across roots |
| PROJECT_NOT_EMPTY | 409 | delete without force |
| LAST_STATUS | 409 | delete of a root's only status |
| ALREADY_LINKED | 409 | PR already on this ticket |
| PAYLOAD_TOO_LARGE | 413 | upload over cap |
| GH_UNAVAILABLE | 503 | gh missing/unauthenticated at link/refresh time |

---

## 4. Live updates

**Bus** (`apps/server/src/events/bus.ts`):

```ts
interface TrellisEvent<T extends EventType = EventType> { id: number; ts: string; type: T; payload: EventPayload[T] }
interface EventBus {
  emit<T>(type: T, payload: EventPayload[T]): void      // assigns id = ++seq, pushes to ring buffer, notifies
  subscribe(fn: (e: TrellisEvent) => void): () => void
  since(id: number): TrellisEvent[] | null              // null if id fell out of the 1000-entry ring buffer
}
```

Event types and payloads (`packages/api/src/events.ts`, shared):

| type | payload |
|---|---|
| project.created / updated / deleted | `{id, rootId}` |
| statuses.changed | `{projectId, rootId}` |
| ticket.created / updated / deleted | `{id, identifier, projectId, rootId, fields?: string[]}` |
| comment.created / updated / deleted | `{id, ticketId}` |
| attachment.added / removed | `{id, ticketId}` |
| pr.linked / unlinked / updated | `{id, ticketId, ciState, state}` |
| gh.status | `{ok, reason?}` |

A service never emits an event inside a transaction. `db/tx.ts#withTx(fn)` gives `fn` a `tx` and an `emit` collector. The queued events go to the bus only after the commit. Thus a client that reacts to an event always sees committed data.

**SSE** (`routes/events.ts`, Hono `streamSSE`): `GET /api/events?since=<id>`. The `Last-Event-ID` header has priority over `since`. When a client connects, the server does these steps:

1. If `since(id)` returns events, the server sends them again.
2. If `since(id)` returns null (the id is too old), the server sends `event: reset`. The client then invalidates all queries.
3. The server sends `event: ready` with `{serverStartedAt, lastId}`.

Each message has `id: <n>`, `event: <type>`, and `data: <json payload>`. The server sends a `: ping` comment every 15 s, so proxies and the gateway keep the connection open. The optional `?types=ticket.*,pr.*` parameter filters the events. A disconnect removes the subscriber. At shutdown, the server sends `event: bye` and ends the streams.

**Web**: `apps/web/src/lib/live.ts` opens a native `EventSource('/api/events')`. The EventSource reconnects automatically with Last-Event-ID. For each event, `live.ts` calls `invalidateFor(event, queryClient)` from `packages/api/src/query-keys.ts`. That function uses the `@orpc/tanstack-query` key helpers:

- `ticket.*` → `orpc.tickets.key()`, `orpc.search.key()`, `orpc.activity.key()`, `orpc.projects.list.key()` (counts)
- `comment.*` → `orpc.comments.list.key({input:{ticket}})` plus that ticket's `tickets.get`
- `pr.*` / `attachment.*` → that ticket's `tickets.get`, `pullRequests.list` / `attachments.list`, and `tickets.list` (badges)
- `statuses.changed`, `project.*` → `orpc.statuses.key()`, `orpc.projects.key()`, `orpc.tickets.list.key()`
- `gh.status` → `orpc.system.gh.key()`
- `reset` → `queryClient.invalidateQueries()`

**Mobile** uses the same `invalidateFor`, with `react-native-sse` as the EventSource, because React Native has no EventSource. Both clients pause the stream when the app is in the background, and resume it with the last id.

**CLI**: `trellis watch` streams `/api/events` with `fetch` and a small SSE parser (`packages/cli/src/sse.ts`). It prints one JSON line for each event: `{id, ts, type, ...payload}`. Flags: `--project CDE`, `--ticket CDE-42`, `--type ticket.updated,pr.updated`, `--since <id>`. It reconnects with backoff and sends Last-Event-ID. It exits 0 on SIGINT, and 5 if the server never answers.

---

## 5. PR + CI polling

Module `apps/server/src/gh/`: `run.ts` (spawn wrapper), `parse.ts` (JSON → normalized rows), `poller.ts` (loop), `detect.ts` (auto-link), `limit.ts` (semaphore).

**`run.ts`**: `Bun.spawn([GH_BIN, ...args], { env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } })`, with a 30 s timeout. It returns `{code, stdout, stderr}`. `GH_BIN = process.env.TRELLIS_GH_BIN ?? 'gh'`. Concurrency: a semaphore with 3 slots wraps every spawn. The poller and `pullRequests.link`/`refresh` share it. ENOENT → gh status `missing`. A stderr that contains `gh auth login`, `HTTP 401`, or `Bad credentials` → `unauthenticated`. An expired token gives the 401, not the login line.

**Calls, verbatim**:

```
gh auth status
gh pr view <url> --json number,title,state,isDraft,url,headRefName,baseRefName,mergedAt,closedAt
gh pr checks <url> --json name,workflow,bucket,link
gh pr list --repo <owner>/<repo> --state open --limit 100 --json number,url,title,headRefName,body
```

`gh pr checks` exits 8 when checks are pending, and 1 when a check fails. If stdout parses as a JSON array, we ignore the exit code. The stderr `no checks reported` with an empty stdout gives empty checks, not an error.

Buckets map 1:1: `pass|fail|pending|skipping|cancel`. `cancel` counts as `fail` in `checks_summary` and `ci_state`. The `checks` snapshot keeps `cancel` verbatim. `state` OPEN/CLOSED/MERGED → lowercase enum. The snapshot rows sort by `workflow, name`. Thus the JSON is stable, and a "changed" diff is a string compare.

**Loop** (`poller.ts`): one `setTimeout` chain with a tick every 10 s. Two ticks never overlap. Each tick does these steps:

1. If gh status is `missing`/`unauthenticated`, the tick runs `gh auth status` again, not more than once in 60 s. It emits `gh.status` when the status changes, and skips the other steps. The server does not crash. It writes one log line for each state change, not one for each tick.
2. The tick selects the due PRs:
   ```sql
   SELECT pr.*, s.category FROM pull_requests pr
   JOIN tickets t ON t.id = pr.ticket_id JOIN statuses s ON s.id = t.status_id
   WHERE (pr.state = 'open' AND s.category NOT IN ('done','canceled'))
      OR (pr.state IN ('merged','closed') AND coalesce(pr.merged_at, pr.closed_at, pr.updated_at) > now() - interval '1 day')
   ```
   The interval for a PR is 20 s if `checks_summary.pending > 0`, and 60 s in other cases. A PR is due when `fetched_at IS NULL OR fetched_at < now() - interval`. The poller never polls an open PR on a done/canceled ticket, or a PR closed for more than a day. `pullRequests.refresh` ignores all these rules.
3. For each due PR, the tick runs `pr view` and then `pr checks` through the semaphore. It writes `title, state, is_draft, merged_at, closed_at, checks, checks_summary, ci_state, fetched_at, fetch_error=null`. If state or ci_state changed, it emits `pr.updated` and writes the activity `pr.state_changed`. The `from`/`to` values are strings like `open/pass`. On a failure, it sets `fetch_error`, does not change `fetched_at`, and writes one warn log line. The next due tick tries the PR again at the same cadence. At this volume, exponential backoff is not necessary.
4. Every 120 s, the tick runs auto-detection (`detect.ts`). Auto-detection runs one `gh pr list` for each distinct declared repo. It applies the regex `\b([A-Z][A-Z0-9]{1,9})-(\d+)\b` to `title + headRefName + body`. It resolves each match `(key, number)` to a ticket whose root has that key and whose project subtree declares the repo. If the PR is not linked, it inserts the link with actor `trellis-poller`/`agent` and writes the activity `pr.linked` with `meta.source = 'auto'`. Then it fetches the PR immediately.

**Decision: auto-detection ships in v1.** It costs one `gh` call for each declared repo every two minutes. With it, an agent that opens a PR with `CDE-42` in the branch name gets the link with no other step.

**Repos**: any project accepts `projects.setRepos`. For detection, the effective repos of a project are the union of the repos of the project and its ancestors. Example: `trellis projects repos CDE --add 0x962/trellis`.

**Banner state**: `system.gh` is a query. The web `GhBanner` component shows "GitHub CLI not authenticated: run `gh auth login` in a terminal" or "gh not found: `brew install gh`". The CLI prints the same line on `trellis status` and on `pr add`. If gh is down, an explicit link (`pullRequests.link`) still stores the row with `fetch_error` set. The server returns the row with a `warning` field, and the CLI exits with code 6.

---

## 6. Attachments

- **Upload**: `attachments.upload` is in the contract, with a `z.file()` input. The oRPC OpenAPI handler serves it as `multipart/form-data`, and the RPC handler serves it natively. Hono `bodyLimit({ maxSize })` wraps `/api/tickets/*/attachments` and `/rpc/attachments/upload`. The cap is 50 MB, and `TRELLIS_MAX_UPLOAD_MB` overrides it. A file over the cap → `PAYLOAD_TOO_LARGE`.
- **Storage** (`services/attachments.ts` + `storage/files.ts`): the service streams the upload to `~/.trellis/attachments/tmp/<ulid>`. At the same time, it sends the bytes to `Bun.CryptoHasher('sha256')`. The final path is `attachments/<sha[0:2]>/<sha>`. If that file already exists, the service deletes the temp file (content-addressed dedupe). Each (ticket, upload) pair gets one DB row, so the same file on two tickets is two rows and one blob. The row stores `path` as a relative path, so `TRELLIS_HOME` can move.
- **Serving**: the Hono route `GET /api/attachments/:id/file` (`routes/files.ts`) finds the row and returns `new Response(Bun.file(abs))` with these headers:
  - `Content-Type: <mime>`
  - `Content-Length`
  - `ETag: "<sha256>"` (304 on `If-None-Match`)
  - `Cache-Control: private, max-age=31536000, immutable`
  - `X-Content-Type-Options: nosniff`
  - `Content-Disposition: inline` for `image/*`, `application/pdf`, `text/plain`, `video/*`, else `attachment; filename="<filename>"`

  The mime is the type that the client declares. A small allowlist regex validates it. An unknown type → `application/octet-stream`. Range requests: not in v1.
- **Thumbnails: none in v1.** Images render inline with CSS `max-height`. Because of the immutable cache, a second view of an image sends no request. `?w=` variants based on `sharp` are a later addition, isolated in `routes/files.ts`.
- **Markdown**: the upload returns `{…, url: '/api/attachments/<id>/file', markdown: '![name](url)'}`. The web editor pastes the `markdown` value, and the CLI prints it.
- **CLI**: `trellis attach CDE-42 ./shot.png` → `new File([await Bun.file(p).arrayBuffer()], basename)` through the oRPC client. `--name` overrides the filename. The command prints the row (JSON) or `Attached shot.png (123 KB) → <url>`.

---

## 7. CLI grammar

**Parser: `citty`.** It gives subcommands, typed args, and a generated `--help`, and its size is ~5 KB. We treat the help text as the contract. A hand-written parser costs a day of work to make the same help text. `packages/cli/src/index.ts` reads the global flags before dispatch.

Global flags: `--json`, `--quiet` (identifier/id only), `--as <kind:name|name>`, `--url <server>` (or `TRELLIS_URL`, default `http://127.0.0.1:4521`), `--no-color`.

| verb | flags | example |
|---|---|---|
| `projects list` | `--archived` | `trellis projects list --json` |
| `projects create` | `--key --name --parent --description` | `trellis projects create --key CDE --name "Code"` |
| `projects show <ref>` | | `trellis projects show CDE` |
| `projects repos <ref>` | `--add o/r` `--remove o/r` | `trellis projects repos CDE --add 0x962/trellis` |
| `statuses list <project>` | | `trellis statuses list CDE` |
| `statuses add <project> <name>` | `--category --color --position` | `trellis statuses add CDE Blocked --category started` |
| `statuses rm <id>` | `--move-to <status>` | |
| `statuses clear <project>` | | sub-project returns to inheriting |
| `create` | `--project -p` `--title -t` `--description -d <text\|->` `--priority` `--status` `--parent` | `trellis create -p CDE -t "Add dark mode" -d - < spec.md` |
| `show <ticket>` | `--comments --activity --prs` | `trellis show CDE-42 --comments` |
| `list` | `--project --status --category --priority --parent --q --has-pr --ci --sort --limit --all` | `trellis list --project CDE --status "Agent Review" --json` |
| `edit <ticket>` | `--title --description --priority --parent --project` | `trellis edit CDE-42 --priority high` |
| `move <ticket> <status>` | `--after <ticket>` `--before <ticket>` | `trellis move CDE-42 "Human Review"` |
| `comment <ticket>` | `--body <text\|->` | `trellis comment CDE-42 --body - <<< "Done, see PR"` |
| `comments <ticket>` | `--limit` | |
| `attach <ticket> <path>` | `--name` | `trellis attach CDE-42 ./file.png` |
| `attachments <ticket>` | | |
| `pr add <ticket> <url>` | | `trellis pr add CDE-42 https://github.com/o/r/pull/7` |
| `pr list <ticket>` / `pr rm <id>` / `pr refresh <ticket>` | | |
| `sub <ticket>` | same as `create`, parent fixed, project defaults to parent's | `trellis sub CDE-42 -t "Write tests"` |
| `delete <ticket>` | `--yes` | |
| `search <q>` | `--project --limit` | `trellis search "dark mode"` |
| `activity <ticket\|--project>` | `--limit` | |
| `watch` | `--project --ticket --type --since` | `trellis watch --project CDE` |
| `open <ticket>` | `--browser` | `trellis open CDE-42` → prints `http://trellis.localhost/CDE-42` |
| `whoami` | | prints resolved actor and how it was resolved |
| `instructions` | `--project CDE` | prints the AGENTS.md block |
| `status` | | server health, db size, gh status, poller stats |
| `serve` | | runs the server in the foreground (what launchd runs) |
| `install` / `uninstall` | `--gateway` `--no-launchd` | |
| `backup [dest]` / `export` | `--json` (export is always JSON) | `trellis export > tickets.json` |
| `restore <tarball>` | | refuses while the server runs |

**Actor resolution order**: `--as` → `TRELLIS_ACTOR` → inference. The inference sets the kind and the name:

- Kind: `agent` if `CLAUDE_SESSION_ID` or `CLAUDECODE` is set, or if stdout is not a TTY. Else `human`.
- Name for an agent: `claude-code` when a `CLAUDE*` variable exists, else `agent`.
- Name for a human: `git config user.name`, else the OS username.

`--as name` without a kind keeps the inferred kind. `whoami` prints the chain, so an agent can check its own actor.

**Output**: a TTY gets aligned columns or a key/value block, with identifiers first. A non-TTY or `--json` gets the exact procedure output. The exception: a list verb prints a JSON *array* of items. The CLI follows cursors up to `--limit` (default 50), or through all pages with `--all`. Errors: one line on stderr, `error: <message> (<CODE>)`. For `STATUS_NOT_IN_PROJECT`, the message lists the valid names.

**Exit codes**: 0 ok · 1 server error · 2 usage (citty validation) · 3 not found · 4 conflict/validation (409/400 domain errors) · 5 server unreachable (`trellis server not running at http://127.0.0.1:4521; run "trellis install" or "bun dev"`) · 6 gh unavailable.

**Idempotence**:

- `move` to the current status is a no-op success.
- `pr add` of a linked PR returns the existing row (exit 0).
- `projects repos --add` has set semantics.
- The server never dedupes `create`. Agents run `search` first.

---

## 8. Agent integration

`trellis instructions [--project CDE]` prints this block with the project key in it. The user pastes the block into `AGENTS.md`/`CLAUDE.md`. The same text is in `packages/cli/src/instructions.md`, which the CLI imports as text. Thus the block has the same version as the CLI.

```
## Ticket workflow (trellis)
Tickets live in trellis, a local tracker. Use the `trellis` CLI; it prints JSON when piped.
Identify yourself: every command runs as `agent:claude-code` automatically inside Claude Code.

1. Pick work:        trellis list --project CDE --status Todo --json
2. Read it:          trellis show CDE-42 --comments --json
3. Start:            trellis move CDE-42 "In Progress"
4. Branch name must contain the identifier, e.g. feat/CDE-42-dark-mode. PRs whose
   title/branch/body contain CDE-42 are linked automatically; or: trellis pr add CDE-42 <url>
5. Split work:       trellis sub CDE-42 -t "Write tests"   (sub-tickets show under the parent)
6. Ask questions:    trellis comment CDE-42 --body "…"     (a human reads comments; wait for a reply)
7. Done coding:      trellis move CDE-42 "Agent Review"    (CI status is shown on the ticket)
8. When CI is green and you have self-reviewed: trellis move CDE-42 "Human Review"
Never move a ticket to Done; a human does that. Never delete tickets.
Watch for replies:   trellis watch --ticket CDE-42
```

**MCP server: later (M7), not v1.** Every procedure has a zod schema and an OpenAPI route. Thus `trellis mcp` can be a ~150-line stdio server in `packages/cli/src/mcp.ts`. It maps each `contract` entry to an MCP tool: name = `trellis_tickets_move`, inputSchema = the zod JSON schema, handler = the oRPC client. For v1, the CLI block in AGENTS.md is sufficient. It works with any agent that has a shell.

---

## 9. Server internals

```
apps/server/
├── drizzle/                      committed migrations (0000_extensions.sql, 0001_init.sql, …) + meta/
├── drizzle.config.ts
├── src/
│   ├── index.ts                  boot sequence; the only file with side effects on import
│   ├── config.ts                 env → typed config (home, port, maxUploadMb, ghBin, webDist, logLevel)
│   ├── app.ts                    builds the Hono app from routes + handlers; exported for tests
│   ├── log.ts                    JSON-lines logger
│   ├── db/
│   │   ├── client.ts             openDb(dataDir | ':memory:') → { pg, db }, loads pg_trgm
│   │   ├── migrate.ts            runs drizzle migrator, sets pg_trgm.similarity_threshold
│   │   ├── schema.ts  enums.ts   tx.ts (withTx + deferred emit)
│   │   └── queries/              effectiveStatuses.ts, search.ts, ticketList.ts (filter/sort/cursor builder)
│   ├── services/                 all business rules; take (ctx, input), return plain objects
│   │   ├── refs.ts projects.ts statuses.ts tickets.ts comments.ts attachments.ts pullRequests.ts activity.ts actors.ts system.ts
│   ├── procedures/               implement(contract).<resource> → services; one file per resource; zero logic
│   ├── routes/                   plain Hono routes outside oRPC: events.ts (SSE), files.ts, static.ts, docs.ts
│   ├── events/bus.ts
│   ├── gh/                       run.ts parse.ts poller.ts detect.ts limit.ts
│   └── storage/files.ts          attachment dir, temp files, hash-and-move
└── test/                         helpers/{db.ts,app.ts,gh-stub.ts}, stubs/gh.ts, *.test.ts
```

**Boot** (`index.ts`) runs these steps in order:

1. Load the config.
2. Make sure that `~/.trellis/{db,attachments/tmp}` exists.
3. `openDb`.
4. `migrate`, in one transaction. The log line is `migrate {applied: n}`.
5. `seedIfEmpty`. It does nothing, because the web onboarding creates the first project.
6. Start the bus.
7. Run `gh auth status` once. Boot does not wait for the result.
8. Start the poller.
9. `Bun.serve({ port, fetch: app.fetch })`.
10. Log `listening {port, home, version}`.

A boot failure exits 1 and writes the reason on one line. launchd then restarts the server (`KeepAlive` with `SuccessfulExit=false` and a 10 s `ThrottleInterval`).

**Request lifecycle**: the Hono middleware chain runs in this order:

1. `requestId`.
2. `logger`: one line for each request, `ts level msg reqId method path status ms actor`.
3. `cors`: only for the `localhost:5173`/`trellis.localhost` origins, for dev.
4. `bodyLimit` on the upload paths.
5. `/rpc/*` RPCHandler and `/api/*` OpenAPIHandler, with `context: { actor: parseActorHeader(req), reqId }`.
6. The plain routes.
7. The static SPA fallback.

The oRPC middleware `requireActor` runs on every mutation procedure and upserts `actors`.

**Validation** is in the contract: zod at the boundary. In dev/test, oRPC also validates outputs. Services enforce the invariants that need the database: the status is in the effective set, a move stays in one root, and a project delete needs an empty project. Procedures are thin adapters: they resolve refs, call the service, and return the result.

**Transactions**: every mutation is one `withTx`. The activity rows, the counter increment, and the entity write commit together. Events flush after the commit.

**Logging**: JSON lines to stdout (`{"ts","level","msg",...fields}`). The logger pretty-prints when stdout is a TTY and `NODE_ENV !== 'production'`. Launchd sends stdout+stderr to `~/.trellis/server.log`. The server does not manage log files. `trellis logs` tails that file.

**Shutdown**: SIGTERM/SIGINT → `server.stop()` (no new connections) → SSE `bye` and close → poller `stop()` waits for the in-flight gh calls (≤30 s, with a 5 s hard deadline for the full shutdown) → `pg.close()` → exit 0. A second signal exits immediately.

**Static serving**: in production, `routes/static.ts` serves `TRELLIS_WEB_DIST` (default `<repo>/apps/web/dist`) with `serveStatic`. Hashed assets get `immutable`, and `index.html` gets `no-cache`. Each GET outside `/api` and `/rpc` falls back to the SPA. If the dist is missing, the server shows a one-paragraph page. The page tells the user to run `bun run build` or to open the Vite URL.

In dev, the Vite `server.proxy` forwards `/api` and `/rpc` to 4521. SSE works through this proxy over http (`changeOrigin: false`).

---

## 10. Testing strategy

- **Unit/service tests** (`apps/server/test/*.test.ts`, `bun test`): `test/helpers/db.ts#freshDb()` creates `new PGlite()` in memory with `pg_trgm` loaded. It runs the committed migrations and returns `db`. Each test file gets one instance (`beforeAll`), and `beforeEach` runs `TRUNCATE … CASCADE`. The tests get real Postgres semantics: FKs, generated tsvector, recursive CTE, transactions. Coverage targets: numbering under concurrency, status inheritance/materialise/clear remaps, list filters + cursors, search ranking, position renumbering, hard-delete cascade + orphan file unlink, activity rows per field.
- **Contract tests**: `test/helpers/app.ts#createTestApp()` starts `app.ts` on `freshDb()` with a temp `TRELLIS_HOME`. It returns an oRPC client whose `RPCLink` uses `fetch: app.request`, so the tests need no port. The tests assert error codes, the actor header rule, OpenAPI routes (`app.request('/api/tickets', { method: 'POST' })` with curl-shaped bodies), an OpenAPI spec with no warnings, SSE replay/reset, and multipart upload.
- **gh at the process boundary**: `TRELLIS_GH_BIN=apps/server/test/stubs/gh.ts` (a Bun script with a shebang). The stub reads `TRELLIS_GH_STUB_FILE`, a JSON map from the first two args (`"pr view"`, `"pr checks"`, `"pr list"`, `"auth status"`) to `{stdout, stderr, exitCode}`. Each test case writes that file into the scratch dir. Poller tests call `poller.tick()` directly with a fake clock, not with timers.
- **CLI smoke** (`packages/cli/test/smoke.test.ts`): the test spawns the real server on a random port with a temp home. It runs `bun src/index.ts …` for create → list → move → comment → show. It asserts the JSON shapes, the exit codes 0/3/4/5, and one stderr line for each error.
- **Playwright e2e** (`apps/web/e2e/`): `webServer` in `playwright.config.ts` starts the server (`TRELLIS_HOME=<tmp>`, `TRELLIS_PORT=4599`) and `vite --port 5199`. Specs:
  - onboarding creates a project
  - Cmd-K finds `CDE-1`
  - create a ticket from the table
  - a drag on the kanban changes the status, and the activity row appears
  - table filters for status/priority update the URL

  CI runs the suite on both OSes, with Chromium only.
- **GitHub Actions** (`.github/workflows/ci.yml`): matrix `os: [macos-latest, ubuntu-latest]`, `oven-sh/setup-bun`, cache `~/.bun/install/cache`. Jobs: `check` (biome + typecheck), `test` (turbo test), `e2e` (Playwright with `--with-deps`), `cli-smoke`. Mobile: `typecheck` only.

---

## 11. Distribution and DX

**First run**: run `git clone … && cd trellis && bun install && bun dev`. Open `http://localhost:5173`, and create the first project in the onboarding screen. The server creates `~/.trellis` when it starts the first time. No other step is necessary.

**`trellis install`** (`packages/cli/src/commands/install.ts`) is idempotent. It does these steps:

1. It runs `bun run build` for `apps/web`, so 4521 serves the SPA.
2. It writes `~/.local/bin/trellis`: `#!/bin/sh\nexec /opt/homebrew/bin/bun "<repo>/packages/cli/src/index.ts" "$@"`. It resolves the repo path from `import.meta.dir`. It runs `chmod +x`, and shows a warning if `~/.local/bin` is not on PATH.
3. It writes `~/Library/LaunchAgents/com.trellis.server.plist` with these keys: `ProgramArguments` `[/opt/homebrew/bin/bun, <repo>/apps/server/src/index.ts]`, `EnvironmentVariables` `{PATH: /opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin, HOME, NODE_ENV: production, TRELLIS_WEB_DIST: <repo>/apps/web/dist}`, `RunAtLoad`, `KeepAlive {SuccessfulExit: false}`, `ThrottleInterval 10`, `StandardOutPath`/`StandardErrorPath` = `~/.trellis/server.log`. Then it runs `launchctl bootout gui/$UID/com.trellis.server` and ignores a failure. Then it runs `launchctl bootstrap gui/$UID <plist>`.
4. Gateway: with `--gateway`, it reads `~/projects/margin/src/gateway.ts`. If `ROUTES` has no `trellis` entry, it inserts `  trellis: 4521,` after the opening brace of `ROUTES` and tells the user. Without the flag (the default), it prints `add to ROUTES in ~/projects/margin/src/gateway.ts:  trellis: 4521,`. The default prints and does not edit, because trellis must not change a file of another repo without notice. On Linux, step 3 writes a systemd user unit, and the other steps stay the same.
5. It waits for `/api/health`, and prints the URLs and `trellis instructions`.

`trellis uninstall` reverses steps 2–3. It does not change `~/.trellis`.

**`npx trellis` / single binary (later)**: `bun build --compile apps/server/src/index.ts --outfile trellis`. The binary needs these changes:

- Migrations imported as text (`import sql from './drizzle/0001_init.sql' with { type: 'text' }` through a generated `drizzle/index.ts`), not read from a directory.
- The PGlite files `pglite.wasm` and `pglite.data` shipped as embedded files (`Bun.embeddedFiles`) and passed as `wasmModule`/`fsBundle` to `new PGlite`.
- Web `dist/**` embedded the same way, with a `routes/static.ts` that reads from the embed map.
- The CLI merged into the same binary (`trellis serve` vs subcommands).
- `gh` stays an external requirement.

The release publishes platform binaries on GitHub Releases, with a small npm launcher package. For this reason, `index.ts` is the only module with side effects, and only `db/migrate.ts` reads migrations by path.

**Versioning**: changesets, one version across all workspaces (fixed group), `CHANGELOG.md` at root, release on tag.

**README skeleton**: hero gif (kanban, and an agent that moves a ticket from a terminal) → "What it is" (three sentences) → 30-second install (clone, `bun install`, `trellis install`) → the agent workflow block from §8 → curl examples (`POST /api/tickets`) → CLI cheat-sheet → architecture diagram (one image) → data location + backup → Contributing link. `CONTRIBUTING.md`: dev loop, the location of each part (§9 tree), the steps to add a procedure (contract → service → procedure → test → CLI verb), migration workflow (`bun db:generate`, commit the SQL). Issue templates: bug (with `trellis status` output), feature.

---

## 12. Migration and data safety

- `drizzle-kit generate` writes migrations into `apps/server/drizzle/`, and we commit them. CI fails if `drizzle-kit generate` makes a diff (`db:check` step). At boot, `drizzle-orm/pglite/migrator` applies all pending files in one transaction. If a migration fails, the previous schema stays intact, and the server exits 1 with the migration name.
- **`trellis backup [dest]`** calls `system.backup`, which runs on the server. The server is the only process that can touch the PGlite dir. `pg.dumpDataDir('gzip')` makes a consistent tarball of the data directory, and the server continues to run. The service writes the tarball to `~/.trellis/backups/<ts>/db.tar.gz`. Then it uses `tar` through `Bun.spawn(['tar', …])` to put that tarball and `attachments/` into `<dest ?? ~/.trellis/backups/trellis-<ts>.tar.gz>`, and returns the path. By default, it keeps the last 10 backups.
- **`trellis restore <tarball>`** runs in the CLI process when the server does not run. It checks `/api/health` first, and refuses if the server is up. It extracts to `~/.trellis.restore-<ts>`, swaps the directories, and prints the steps to start the server. A restore of an older schema works, because boot migrates forward.
- **`trellis export --json`** streams `GET /api/export`: `{version, exportedAt, projects, repos, statuses, tickets (with identifier), comments, pullRequests, attachments (metadata + url), activity}`. Import is not in v1. The export exists so that no user is locked in.

---

## 13. Phased build order

Each milestone ends with a usable result and a concrete acceptance check.

**M1: server + db + CLI (agents can use it with no UI)**
Creates: root config (package.json, turbo.json, biome.json, tsconfig.base.json, CI), `packages/api` (schemas, contract for projects/statuses/tickets/comments/activity/actors/search/system, client factory, events.ts), `apps/server` (config, log, db/*, migrations 0000–0001, services for the same resources, procedures, app.ts, index.ts, routes/events.ts, events/bus.ts, docs route), `packages/cli` (index, actor resolution, output, sse, verbs: projects, statuses, create, show, list, edit, move, comment, comments, sub, delete, search, activity, watch, whoami, open, status, instructions). Tests: db helpers, numbering, inheritance, list/cursor, contract errors, CLI smoke.
Accept: from a fresh clone, run `bun dev`, and then `trellis projects create --key CDE --name Code && trellis create -p CDE -t "First" && trellis move CDE-1 "In Progress" && trellis list --status "In Progress" --json`. The last command prints one ticket. `curl -H 'x-trellis-actor: agent:curl' -d '{"project":"CDE","title":"Via curl"}' -H 'content-type: application/json' localhost:4521/api/tickets` returns `CDE-2`. `trellis watch` in another terminal shows both events. `/api/docs` renders.

**M2: web table + ticket page**
Creates: `apps/web` (Vite, router with routes `/`, `/:projectKey`, `/:identifier`, `/settings`), `lib/orpc.ts` (client + `@orpc/tanstack-query`), `lib/live.ts`, `packages/api/src/query-keys.ts`, onboarding, project sidebar tree, ticket table (TanStack Table, sort by column), ticket page (markdown editor/preview, priority/status/parent controls, comments, activity feed), actor name setting, `routes/static.ts`.
Accept: create a ticket in the UI, and move it from the CLI. The table row and the ticket page update without a reload. The Playwright "create ticket" spec passes.

**M3: kanban + filters + Cmd-K + search**
Creates: kanban route `/:projectKey/board` (dnd-kit, `tickets.move` with after/before), shared filter bar with URL-synced state (`?status=&priority=&q=`), Cmd-K palette (search.query + commands: new ticket, go to project, toggle board/table), status settings page (create/reorder/rename/clear, "customise for this sub-project"), `db/queries/search.ts` trigram path.
Accept: drag a card to a different column, and `trellis activity CDE-1` shows the status row. In Cmd-K, `cde-1` and a title with a typo both resolve. Table filters persist in the URL. The Playwright kanban + filter specs pass.

**M4: PRs + CI live**
Creates: `gh/*`, `pull_requests` migration, `services/pullRequests.ts`, procedures + CLI `pr add|list|rm|refresh`, `projects repos`, web PR card on ticket page (state, draft, checks list with links), CI badge in table/kanban cards, `GhBanner`, `system.gh`, poller tests with the gh stub.
Accept: `trellis pr add CDE-1 <real PR url>` shows checks in less than a minute. A push of a commit changes the badge to pending, and then to pass. After `gh auth logout`, the banner appears, and the log shows one line, not a loop. The poller links a branch named `CDE-2-foo` automatically.

**M5: attachments + polish + install command**
Creates: `attachments` migration, `storage/files.ts`, `services/attachments.ts`, `routes/files.ts`, upload procedure, web drag/paste-to-upload in editor and attachment list, CLI `attach|attachments`, `install|uninstall|backup|restore|export|serve|logs`, `system.backup/export`, README/CONTRIBUTING/templates/changesets, keyboard shortcuts on ticket page, empty states.
Accept: run `trellis install` from a fresh shell. After a reboot, `http://trellis.localhost` serves the built app. `trellis attach CDE-1 ./img.png` renders inline on the ticket. `trellis backup` and then `trellis restore` on an empty home give the same data. The README install steps work on a second machine.

**M6: mobile**
Creates: `apps/mobile` (expo-router: project list, ticket list with status filter, ticket detail with comments and PR status, quick move sheet), `lib/orpc.ts`, `react-native-sse` live hook, server URL setting (defaults to `http://trellis.localhost` when on the same machine's network via a QR code from the web settings page).
Accept: on a device on the LAN, post a comment from the phone. The comment appears live on the web ticket page. A `trellis move` shows on the phone in less than a second.

**M7 (after v1)**: `trellis mcp`, thumbnails, Range requests, import, compiled binary.

---

### Critical Files for Implementation
- `/Users/navidkhan/projects/trellis/packages/api/src/contract/index.ts`: the oRPC contract (routes, schemas, typed errors). Every client and the server derive from it.
- `/Users/navidkhan/projects/trellis/apps/server/src/db/schema.ts`: Drizzle schema, enums, generated tsvector, indexes.
- `/Users/navidkhan/projects/trellis/apps/server/src/services/tickets.ts`: numbering, status validation/inheritance, move/position, activity rows, event emission.
- `/Users/navidkhan/projects/trellis/apps/server/src/gh/poller.ts`: PR/CI cadence rules, gh call shapes, auth state, auto-detection.
- `/Users/navidkhan/projects/trellis/packages/cli/src/index.ts`: citty root, actor resolution, JSON/TTY output, exit code mapping.
