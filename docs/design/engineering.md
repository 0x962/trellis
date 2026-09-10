# Trellis engineering design

Local-only ticket tracker for one engineer and the agents that work their tickets. This document fixes the architecture; each section ends in a decision, not a menu.

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

**Why the contract lives in `packages/api`, not the server.** We use oRPC contract-first (`@orpc/contract`): `packages/api` defines `contract` (routes, zod input/output, typed errors) and `createTrellisClient(baseUrl, actor)`. The server does `implement(contract)`. Result: web, mobile and CLI depend on `@trellis/api` only and never import server code, so the dependency graph is a star, and `bun test` in `packages/cli` never boots Postgres types.

**Dependency graph** (workspace → workspace):

```
@trellis/api      ← @trellis/server, @trellis/web, @trellis/mobile, @trellis/cli
@trellis/server   ← (nothing; e2e tests start it as a process)
```

Packages export TypeScript source directly (`"exports": { ".": "./src/index.ts" }`). There is no build step for `packages/*`; only `apps/web` (Vite) and `apps/server` (for the compiled-binary story) have `build`.

**turbo.json tasks**

| task | dependsOn | cache | outputs | notes |
|---|---|---|---|---|
| `dev` | — | false | — | `persistent: true`; mobile task also `interactive: true` |
| `build` | `^build` | true | `dist/**` | web: `vite build`; server: `bun build --compile` (M5+); others no-op |
| `test` | — | true | — | `bun test` in every workspace |
| `typecheck` | — | true | — | `tsc --noEmit` (TS 7 native binary) per workspace |
| `lint` | — | true | — | `biome check .` per workspace, root `biome.json` applies |
| `db:generate` | — | false | `drizzle/**` | server only: `drizzle-kit generate` |

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

`bun dev` runs the server on 4521 (with `TRELLIS_HOME` defaulting to `~/.trellis`) and Vite on 5173 with `/api` and `/rpc` proxied to 4521. The turbo TUI gives one pane per app.

---

## 2. Database schema

Dialect: Postgres via `drizzle-orm/pglite`. Ids are ULIDs (`text`, 26 chars) generated in the app with the `ulid` package: sortable, no sequence, and safe to generate before insert. Timestamps are `timestamptz` with `default now()`. All tables live in `apps/server/src/db/schema.ts`; enums in `apps/server/src/db/enums.ts`.

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
| ticket_counter | integer NOT NULL DEFAULT 0 | only meaningful on roots |
| position | integer NOT NULL DEFAULT 0 | sibling order |
| archived_at | timestamptz | |
| created_at, updated_at | timestamptz NOT NULL | |

Indexes: `(parent_id)`, `(root_id)`. Re-parenting is allowed only within the same root (`CROSS_ROOT_MOVE` error otherwise) so `root_id` never changes.

### repos
| column | type | constraints |
|---|---|---|
| id | text PK | |
| project_id | text NOT NULL | FK projects ON DELETE CASCADE |
| owner, repo | text NOT NULL | |
| created_at | timestamptz | |

UNIQUE `(project_id, owner, repo)`. A ticket's *effective repos* = repos of its project plus all ancestors.

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

UNIQUE `(project_id, name)`, INDEX `(project_id, position)`. Root projects are seeded on create with Todo/todo, In Progress/started, Agent Review/review, Human Review/review, Done/done, Canceled/canceled. A root must keep at least one status (delete refused with `LAST_STATUS`).

**Inheritance rule as a query** (`db/queries/effectiveStatuses.ts`): walk up from the project and take the first level that owns any statuses.

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

Roots always own statuses, so `owner` is never empty. When a sub-project first creates its own status (`statuses.create` on an inheriting project), the service copies the effective set into the sub-project inside the same transaction, then adds the new one; tickets in that subtree keep pointing at the copies (remapped by name, then by category). `statuses.clear` deletes the sub-project's set and remaps its subtree's tickets to the parent's effective set by name, then category. Every remap writes an activity row.

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

The identifier `CDE-42` is not stored. It is `root.key || '-' || number` from a join on `root_id`; renaming a key renames every ticket, which is the behaviour we want. Parsing `CDE-42` → `(key, number)` → `(root_id, number)` is one indexed lookup.

**Ticket numbering** (`services/tickets.ts#create`): inside one transaction, `UPDATE projects SET ticket_counter = ticket_counter + 1 WHERE id = $root RETURNING ticket_counter`, then insert with that number. The row lock serializes allocations; a rolled-back transaction leaves a gap, which is acceptable. Drizzle's PGlite driver delegates `db.transaction()` to `PGlite.transaction()`, which holds the instance mutex, so two transactions cannot interleave statements. A test asserts 50 concurrent `create` calls yield 50 distinct consecutive numbers.

**Kanban position**: new tickets get `max(position in status) + 1024`; moves set the midpoint between neighbours; when the gap falls below 1e-6 the service renumbers the column in steps of 1024 inside the same transaction. Double precision keeps the scheme explainable in one sentence.

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

INDEX `(ticket_id)`, `(sha256)`. Two rows may share a `sha256`/`path` (dedupe); the file is unlinked only when the last row referencing the hash goes away.

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
| field | text | `title`, `description`, `status`, `priority`, `parent`, `project`, `position` — one row per field |
| from_value, to_value | text | human-readable (status *name*, parent *identifier*); for description, the full old/new text |
| meta | jsonb | ids behind the names, PR url, attachment id |
| created_at | timestamptz | |

INDEX `(ticket_id, id)`, `(project_id, id)`.

### actors
`(name text, kind actor_kind, first_seen_at, last_seen_at)`, PRIMARY KEY `(name, kind)`. Upserted on every mutation; feeds the actor picker and `trellis whoami` suggestions.

**Delete policy: hard delete.** Single user, real backups (`trellis backup`), and a `canceled` category for "went away". Deleting a ticket cascades comments/attachments/PRs/activity, sets children's `parent_id` null, unlinks orphaned files, and writes one project-level activity row `ticket.deleted` with `meta: {identifier, title}` so the feed still shows it. Deleting a project requires it to have no tickets and no children (`PROJECT_NOT_EMPTY`) unless `force: true`, which deletes the subtree. The CLI demands `--yes` for both.

**Extensions**: exactly one, `pg_trgm`, from `@electric-sql/pglite/contrib/pg_trgm`, passed as `new PGlite({ dataDir, extensions: { pg_trgm } })` in `db/client.ts`. Full-text search is core Postgres and needs nothing. Migration `0000_extensions.sql` (created with `drizzle-kit generate --custom`) contains `CREATE EXTENSION IF NOT EXISTS pg_trgm;`; the schema migration `0001_init.sql` follows.

**Search** (`db/queries/search.ts`): given `q`, (1) if it matches `^[A-Z][A-Z0-9]{1,9}-\d+$` return that ticket first; (2) FTS `search @@ websearch_to_tsquery('english', q)` ranked by `ts_rank`; (3) union trigram matches `title % q` ranked by `similarity(title, q)` for typos and 2–3 character prefixes (`pg_trgm.similarity_threshold` set to 0.25 at boot). Deduped, limited to 20.

---

## 3. oRPC contract

Defined in `packages/api/src/contract/*.ts` with `oc.route({ method, path })` per procedure, zod 4 schemas in `packages/api/src/schemas/*.ts`. Server mounts `RPCHandler` at `/rpc` (typed clients: web, mobile, CLI) and `OpenAPIHandler` at `/api` (curl, agents, Scalar docs at `/api/docs`, spec at `/api/openapi.json`). Both serve the same router.

**Actor: a header, `x-trellis-actor: <kind>:<name>`**, e.g. `agent:claude-code`, `human:navid`. Split on the first colon; name may contain anything else. Justification: (a) inputs stay pure domain objects, so the OpenAPI docs and CLI flags do not carry a boilerplate field on 25 procedures; (b) the CLI resolves the actor once per process and sets it on the client; (c) curl is one `-H`; (d) the OpenAPI spec declares it as an `apiKey`-in-header security scheme, so Scalar's "try it" prompts for it. Mutations without the header fail `ACTOR_REQUIRED` (400) with the message `Set header x-trellis-actor, e.g. "x-trellis-actor: agent:claude-code"`. Reads never need it. The web app sends `human:<name>` from localStorage, initialised from `actors.default`.

**References**: any ticket-scoped input takes `ticket: TicketRef` (ULID or `CDE-42`), any project-scoped input `project: ProjectRef` (ULID or `CDE`). Resolution lives in `services/refs.ts`; unknown → `NOT_FOUND`.

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

**`tickets.list` input** (used by table, kanban, CLI):

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

The table calls it with its filters and pages by cursor. The kanban calls it with `sort: {field:'position'}`, `limit: 500`, `filter.completedAfter = now-30d`, and groups client-side by `statusId`; the response's `items` carry `statusId`, `position`, so drag-and-drop is a `tickets.move` followed by invalidation. `total` is a `count(*)` under the same filter.

**Cursors**: opaque base64url JSON `{v: <sort value>, id}`; the server rebuilds keyset predicates `(sortcol, id) < (v, id)`. Every list follows the `{items, nextCursor}` shape; activity/comments use the ULID `id` alone.

**Errors** (declared with oRPC typed `errors` on the contract so clients get them as a union):

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
| LAST_STATUS | 409 | deleting a root's only status |
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

Services never emit mid-transaction. `db/tx.ts#withTx(fn)` hands `fn` a `tx` and an `emit` collector; queued events flush to the bus only after commit, so a client that reacts to an event always sees committed data.

**SSE** (`routes/events.ts`, Hono `streamSSE`): `GET /api/events?since=<id>`; `Last-Event-ID` header wins over `since`. On connect: if `since(id)` returns events, replay them; if it returns null (too old), send `event: reset` and the client invalidates everything. Then `event: ready` with `{serverStartedAt, lastId}`. Messages: `id: <n>`, `event: <type>`, `data: <json payload>`. A `: ping` comment every 15 s keeps proxies and the gateway happy. Optional `?types=ticket.*,pr.*` filter. Disconnect removes the subscriber; shutdown sends `event: bye` and ends streams.

**Web**: `apps/web/src/lib/live.ts` opens a native `EventSource('/api/events')` (auto-reconnect with Last-Event-ID) and calls `invalidateFor(event, queryClient)` from `packages/api/src/query-keys.ts`, built on `@orpc/tanstack-query` key helpers:

- `ticket.*` → `orpc.tickets.key()`, `orpc.search.key()`, `orpc.activity.key()`, `orpc.projects.list.key()` (counts)
- `comment.*` → `orpc.comments.list.key({input:{ticket}})` plus that ticket's `tickets.get`
- `pr.*` / `attachment.*` → that ticket's `tickets.get`, `pullRequests.list` / `attachments.list`, and `tickets.list` (badges)
- `statuses.changed`, `project.*` → `orpc.statuses.key()`, `orpc.projects.key()`, `orpc.tickets.list.key()`
- `gh.status` → `orpc.system.gh.key()`
- `reset` → `queryClient.invalidateQueries()`

**Mobile** uses the same `invalidateFor` with `react-native-sse` as the EventSource (RN has none). Both clients pause the stream when backgrounded and resume with the last id.

**CLI** `trellis watch` streams `/api/events` with `fetch` and a tiny SSE parser (`packages/cli/src/sse.ts`), printing one JSON line per event `{id, ts, type, ...payload}`; flags `--project CDE`, `--ticket CDE-42`, `--type ticket.updated,pr.updated`, `--since <id>`; reconnects with backoff carrying Last-Event-ID; exits 0 on SIGINT, 5 if the server never answers.

---

## 5. PR + CI polling

Module `apps/server/src/gh/`: `run.ts` (spawn wrapper), `parse.ts` (JSON → normalized rows), `poller.ts` (loop), `detect.ts` (auto-link), `limit.ts` (semaphore).

**`run.ts`**: `Bun.spawn([GH_BIN, ...args], { env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } })`, 30 s timeout, returns `{code, stdout, stderr}`. `GH_BIN = process.env.TRELLIS_GH_BIN ?? 'gh'`. Concurrency: a 3-slot semaphore around every spawn; the poller and `pullRequests.link`/`refresh` share it. ENOENT → gh status `missing`; stderr containing `gh auth login`, `HTTP 401`, or `Bad credentials` → `unauthenticated` (an expired token gives the 401, not the login line).

**Calls, verbatim**:

```
gh auth status
gh pr view <url> --json number,title,state,isDraft,url,headRefName,baseRefName,mergedAt,closedAt
gh pr checks <url> --json name,workflow,bucket,link
gh pr list --repo <owner>/<repo> --state open --limit 100 --json number,url,title,headRefName,body
```

`gh pr checks` exits 8 when checks are pending and 1 when any fail; we ignore the exit code whenever stdout parses as a JSON array. stderr `no checks reported` with empty stdout → empty checks, not an error. Buckets map 1:1: `pass|fail|pending|skipping|cancel`; `cancel` counts as `fail` in `checks_summary` and `ci_state`, but is kept verbatim in the `checks` snapshot. `state` OPEN/CLOSED/MERGED → lowercase enum. Snapshot rows are sorted by `workflow, name` so the JSON is stable and a "changed" diff is a string compare.

**Loop** (`poller.ts`): a single `setTimeout` chain ticking every 10 s (no overlap). Each tick:

1. If gh status is `missing`/`unauthenticated`: re-run `gh auth status` at most once per 60 s, emit `gh.status` on change, skip the rest. No crash, no log spam (one line per state change).
2. Select due PRs:
   ```sql
   SELECT pr.*, s.category FROM pull_requests pr
   JOIN tickets t ON t.id = pr.ticket_id JOIN statuses s ON s.id = t.status_id
   WHERE (pr.state = 'open' AND s.category NOT IN ('done','canceled'))
      OR (pr.state IN ('merged','closed') AND coalesce(pr.merged_at, pr.closed_at, pr.updated_at) > now() - interval '1 day')
   ```
   Interval per PR: 20 s if `checks_summary.pending > 0`, else 60 s; due when `fetched_at IS NULL OR fetched_at < now() - interval`. Open PRs on done/canceled tickets and anything closed for more than a day are never polled; `pullRequests.refresh` bypasses all rules.
3. For each due PR (through the semaphore): `pr view` then `pr checks`; write `title, state, is_draft, merged_at, closed_at, checks, checks_summary, ci_state, fetched_at, fetch_error=null`; if state or ci_state changed emit `pr.updated` and write activity `pr.state_changed` (`from`/`to` = `open/pass` style strings). On failure: `fetch_error` set, `fetched_at` untouched, one warn log; the PR is retried on the next due tick with the same cadence (no exponential backoff needed at this volume).
4. Every 120 s, auto-detection (`detect.ts`): for each distinct declared repo, one `gh pr list`; regex `\b([A-Z][A-Z0-9]{1,9})-(\d+)\b` over `title + headRefName + body`; for each match resolve `(key, number)` to a ticket whose root has that key and whose project subtree declares the repo; insert if not linked, actor `trellis-poller`/`agent`, activity `pr.linked` with `meta.source = 'auto'`, then fetch it immediately. **Decision: auto-detection ships in v1**: it is one `gh` call per declared repo per two minutes and it is what makes "agent opens PR with `CDE-42` in the branch name" just work.

**Repos**: `projects.setRepos` on any project; effective repos for detection are the union up the ancestor chain. `trellis projects repos CDE --add 0x962/trellis`.

**Banner state**: `system.gh` is a query; the web `GhBanner` component shows "GitHub CLI not authenticated: run `gh auth login` in a terminal" or "gh not found: `brew install gh`"; the CLI prints the same line on `trellis status` and on `pr add`. Explicit linking (`pullRequests.link`) with gh down still stores the row (`fetch_error` set) and returns it with a `warning` field; exit code 6 in the CLI.

---

## 6. Attachments

- **Upload**: `attachments.upload` in the contract, `z.file()` input, served by oRPC's OpenAPI handler as `multipart/form-data` and by the RPC handler natively. Hono `bodyLimit({ maxSize })` wraps `/api/tickets/*/attachments` and `/rpc/attachments/upload`; cap 50 MB, `TRELLIS_MAX_UPLOAD_MB` override; over-limit → `PAYLOAD_TOO_LARGE`.
- **Storage** (`services/attachments.ts` + `storage/files.ts`): stream to `~/.trellis/attachments/tmp/<ulid>` while feeding `Bun.CryptoHasher('sha256')`; final path `attachments/<sha[0:2]>/<sha>`; if it already exists, drop the temp file (content-addressed dedupe). DB row per (ticket, upload) so the same file on two tickets is two rows, one blob. `path` stored relative so `TRELLIS_HOME` can move.
- **Serving**: Hono route `GET /api/attachments/:id/file` (`routes/files.ts`): looks up the row, `new Response(Bun.file(abs))` with `Content-Type: <mime>`, `Content-Length`, `ETag: "<sha256>"` (304 on `If-None-Match`), `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` for `image/*`, `application/pdf`, `text/plain`, `video/*`, else `attachment; filename="<filename>"`. Mime is the client-declared type validated against a small allowlist regex; unknown → `application/octet-stream`. Range requests: not in v1.
- **Thumbnails: none in v1.** Images render inline with CSS `max-height`; the immutable cache makes repeats free. `sharp`-based `?w=` variants are a later, isolated addition to `routes/files.ts`.
- **Markdown**: upload returns `{…, url: '/api/attachments/<id>/file', markdown: '![name](url)'}`; the web editor pastes that; the CLI prints it.
- **CLI**: `trellis attach CDE-42 ./shot.png` → `new File([await Bun.file(p).arrayBuffer()], basename)` through the oRPC client; `--name` overrides filename; prints the row (JSON) or `Attached shot.png (123 KB) → <url>`.

---

## 7. CLI grammar

**Parser: `citty`.** It gives subcommands, typed args, generated `--help`, and it is ~5 KB; a hand-rolled parser would spend a day re-implementing help text, which we treat as the contract. Global flags are handled in `packages/cli/src/index.ts` before dispatch.

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
| `restore <tarball>` | | refuses while the server is running |

**Actor resolution order**: `--as` → `TRELLIS_ACTOR` → kind: `agent` if `CLAUDE_SESSION_ID` or `CLAUDECODE` is set or stdout is not a TTY, else `human`; name: for agents `claude-code` when a `CLAUDE*` variable exists, else `agent`; for humans `git config user.name`, else OS username. `--as name` without a kind keeps the inferred kind. `whoami` prints the chain so agents can self-check.

**Output**: TTY → aligned columns or a key/value block, identifiers first; non-TTY or `--json` → exactly the procedure output, except list verbs print a JSON *array* of items (the CLI follows cursors up to `--limit`, default 50, `--all` for everything). Errors: one line on stderr, `error: <message> (<CODE>)`, and for `STATUS_NOT_IN_PROJECT` the valid names are in the message.

**Exit codes**: 0 ok · 1 server error · 2 usage (citty validation) · 3 not found · 4 conflict/validation (409/400 domain errors) · 5 server unreachable (`trellis server not running at http://127.0.0.1:4521; run "trellis install" or "bun dev"`) · 6 gh unavailable.

**Idempotence**: `move` to the current status is a no-op success; `pr add` of a linked PR returns the existing row (0); `projects repos --add` is set semantics; `create` is never deduped (agents should `search` first).

---

## 8. Agent integration

`trellis instructions [--project CDE]` prints this block (project key substituted), meant for pasting into `AGENTS.md`/`CLAUDE.md`. The same text lives in `packages/cli/src/instructions.md` (imported as text) so it is versioned with the CLI.

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

**MCP server: later (M7), not v1.** Every procedure already has a zod schema and an OpenAPI route, so `trellis mcp` becomes a ~150-line stdio server in `packages/cli/src/mcp.ts` that maps `contract` entries to MCP tools (name = `trellis_tickets_move`, inputSchema = the zod JSON schema, handler = the oRPC client). The CLI-in-AGENTS.md path is enough for v1 and works with any agent that has a shell.

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

**Boot** (`index.ts`): load config → ensure `~/.trellis/{db,attachments/tmp}` → `openDb` → `migrate` (single transaction, logged as `migrate {applied: n}`) → `seedIfEmpty` (nothing; the web onboarding creates the first project) → start bus → `gh auth status` once (non-blocking) → start poller → `Bun.serve({ port, fetch: app.fetch })` → log `listening {port, home, version}`. A boot failure exits 1 with the reason on one line; launchd restarts it (`KeepAlive` with `SuccessfulExit=false` and a 10 s `ThrottleInterval`).

**Request lifecycle**: Hono middleware chain: `requestId` → `logger` (one line per request: `ts level msg reqId method path status ms actor`) → `cors` (only for `localhost:5173`/`trellis.localhost` origins, dev convenience) → `bodyLimit` on upload paths → `/rpc/*` RPCHandler and `/api/*` OpenAPIHandler with `context: { actor: parseActorHeader(req), reqId }` → plain routes → static SPA fallback. The oRPC middleware `requireActor` runs on every mutating procedure and upserts `actors`.

**Validation** lives in the contract (zod at the boundary; oRPC also validates outputs in dev/test). Services enforce invariants that need the database (status belongs to effective set, same-root moves, non-empty project). Procedures are thin adapters: resolve refs, call service, return.

**Transactions**: every mutation is one `withTx`; the activity rows, the counter bump and the entity write commit together; events flush after commit.

**Logging**: JSON lines to stdout (`{"ts","level","msg",...fields}`), pretty-printed when stdout is a TTY and `NODE_ENV !== 'production'`. Launchd redirects stdout+stderr to `~/.trellis/server.log`; the server does not manage log files itself (`trellis logs` tails that file).

**Shutdown**: SIGTERM/SIGINT → `server.stop()` (stop accepting) → SSE `bye` and close → poller `stop()` awaits in-flight gh (≤30 s, but a 5 s hard deadline overall) → `pg.close()` → exit 0. Second signal exits immediately.

**Static serving**: in production `routes/static.ts` serves `TRELLIS_WEB_DIST` (default `<repo>/apps/web/dist`) with `serveStatic`, hashed assets `immutable`, `index.html` `no-cache`, SPA fallback for any non-`/api`/`/rpc` GET. If the dist is missing it serves a one-paragraph page saying to run `bun run build` or open the Vite URL. In dev Vite's `server.proxy` forwards `/api` and `/rpc` to 4521 (SSE proxies fine over http; `changeOrigin: false`).

---

## 10. Testing strategy

- **Unit/service tests** (`apps/server/test/*.test.ts`, `bun test`): `test/helpers/db.ts#freshDb()` creates `new PGlite()` (in-memory, `pg_trgm` loaded), runs the committed migrations, returns `db`. One instance per test file (`beforeAll`), `TRUNCATE … CASCADE` in `beforeEach`. Real Postgres semantics: FKs, generated tsvector, recursive CTE, transactions. Coverage targets: numbering under concurrency, status inheritance/materialise/clear remaps, list filters + cursors, search ranking, position renumbering, hard-delete cascade + orphan file unlink, activity rows per field.
- **Contract tests**: `test/helpers/app.ts#createTestApp()` boots `app.ts` against `freshDb()` with a temp `TRELLIS_HOME` and returns an oRPC client whose `RPCLink` uses `fetch: app.request` (no port). Tests assert error codes, actor header enforcement, OpenAPI routes (`app.request('/api/tickets', { method: 'POST' })` with curl-shaped bodies), the OpenAPI spec generating without warnings, SSE replay/reset, and multipart upload.
- **gh at the process boundary**: `TRELLIS_GH_BIN=apps/server/test/stubs/gh.ts` (a Bun script with a shebang). It reads `TRELLIS_GH_STUB_FILE`, a JSON map from the first two args (`"pr view"`, `"pr checks"`, `"pr list"`, `"auth status"`) to `{stdout, stderr, exitCode}`; tests write that file into the scratch dir per case. Poller tests drive `poller.tick()` directly with a fake clock instead of timers.
- **CLI smoke** (`packages/cli/test/smoke.test.ts`): spawns the real server on a random port with a temp home, runs `bun src/index.ts …` for create → list → move → comment → show, asserts JSON shapes and exit codes 0/3/4/5, and that stderr is one line on errors.
- **Playwright e2e** (`apps/web/e2e/`): `playwright.config.ts` `webServer` starts the server (`TRELLIS_HOME=<tmp>`, `TRELLIS_PORT=4599`) and `vite --port 5199`. Specs: onboarding creates project; Cmd-K finds `CDE-1`; create ticket from table; drag on kanban changes status and the activity row appears; table filters by status/priority update the URL. Runs on both OSes in CI (Chromium only).
- **GitHub Actions** (`.github/workflows/ci.yml`): matrix `os: [macos-latest, ubuntu-latest]`, `oven-sh/setup-bun`, cache `~/.bun/install/cache`; jobs `check` (biome + typecheck), `test` (turbo test), `e2e` (Playwright with `--with-deps`), `cli-smoke`. Mobile: `typecheck` only.

---

## 11. Distribution and DX

**First run**: `git clone … && cd trellis && bun install && bun dev`, open `http://localhost:5173`, create the first project in the onboarding screen. The server creates `~/.trellis` on first boot. Nothing else is required.

**`trellis install`** (`packages/cli/src/commands/install.ts`), idempotent:
1. `bun run build` for `apps/web` (so 4521 serves the SPA).
2. Writes `~/.local/bin/trellis`: `#!/bin/sh\nexec /opt/homebrew/bin/bun "<repo>/packages/cli/src/index.ts" "$@"` (repo path resolved from `import.meta.dir`), `chmod +x`, warns if `~/.local/bin` is not on PATH.
3. Writes `~/Library/LaunchAgents/com.trellis.server.plist`: `ProgramArguments` `[/opt/homebrew/bin/bun, <repo>/apps/server/src/index.ts]`, `EnvironmentVariables` `{PATH: /opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin, HOME, NODE_ENV: production, TRELLIS_WEB_DIST: <repo>/apps/web/dist}`, `RunAtLoad`, `KeepAlive {SuccessfulExit: false}`, `ThrottleInterval 10`, `StandardOutPath`/`StandardErrorPath` = `~/.trellis/server.log`. Then `launchctl bootout gui/$UID/com.trellis.server` (ignore failure) and `launchctl bootstrap gui/$UID <plist>`.
4. Gateway: with `--gateway`, reads `~/projects/margin/src/gateway.ts`, and if `ROUTES` lacks `trellis`, inserts `  trellis: 4521,` after the opening brace of `ROUTES` and says so; without the flag (default) it prints `add to ROUTES in ~/projects/margin/src/gateway.ts:  trellis: 4521,`. Default is print, not edit; another repo's file should not be modified silently. On Linux, step 3 writes a systemd user unit instead; the rest is identical.
5. Waits for `/api/health`, prints the URLs and `trellis instructions`.

`trellis uninstall` reverses 2–3 and leaves `~/.trellis` alone.

**`npx trellis` / single binary (later)**: `bun build --compile apps/server/src/index.ts --outfile trellis`. Needs: migrations imported as text (`import sql from './drizzle/0001_init.sql' with { type: 'text' }` via a generated `drizzle/index.ts`) instead of directory reads; PGlite's `pglite.wasm` and `pglite.data` shipped as embedded files (`Bun.embeddedFiles`) and passed as `wasmModule`/`fsBundle` to `new PGlite`; web `dist/**` embedded the same way with `routes/static.ts` reading from the embed map; the CLI merged into the same binary (`trellis serve` vs subcommands); `gh` stays an external requirement. Published as platform binaries on GitHub Releases with a tiny npm launcher package. This is why `index.ts` is the only side-effecting module and why migrations are never read by path outside `db/migrate.ts`.

**Versioning**: changesets, one version across all workspaces (fixed group), `CHANGELOG.md` at root, release on tag.

**README skeleton**: hero gif (kanban + agent moving a ticket from a terminal) → "What it is" (three sentences) → 30-second install (clone, `bun install`, `trellis install`) → the agent workflow block from §8 → curl examples (`POST /api/tickets`) → CLI cheat-sheet → architecture diagram (one image) → data location + backup → Contributing link. `CONTRIBUTING.md`: dev loop, where things live (§9 tree), how to add a procedure (contract → service → procedure → test → CLI verb), migration workflow (`bun db:generate`, commit the SQL). Issue templates: bug (with `trellis status` output), feature.

---

## 12. Migration and data safety

- Migrations are generated by `drizzle-kit generate` into `apps/server/drizzle/` and committed; CI fails if `drizzle-kit generate` produces a diff (`db:check` step). Applied at boot by `drizzle-orm/pglite/migrator`, which runs all pending files inside one transaction; a failure leaves the previous schema intact and the server exits 1 with the migration name.
- **`trellis backup [dest]`** calls `system.backup`, which runs on the server (the only process allowed to touch the PGlite dir): `pg.dumpDataDir('gzip')` produces a consistent tarball of the data directory without stopping the server; the service writes it to `~/.trellis/backups/<ts>/db.tar.gz`, then tars it with `attachments/` into `<dest ?? ~/.trellis/backups/trellis-<ts>.tar.gz>` using Bun's `tar` via `Bun.spawn(['tar', …])`, and returns the path. Keeps the last 10 by default.
- **`trellis restore <tarball>`** runs in the CLI process with the server stopped (checks `/api/health` first, refuses if up): extracts to `~/.trellis.restore-<ts>`, swaps directories, prints how to start the server. Restoring an older schema is fine because boot migrates forward.
- **`trellis export --json`** streams `GET /api/export`: `{version, exportedAt, projects, repos, statuses, tickets (with identifier), comments, pullRequests, attachments (metadata + url), activity}`. Import is not in v1; the export exists so nobody is locked in.

---

## 13. Phased build order

Each milestone ends with something usable and a concrete acceptance check.

**M1: server + db + CLI (agents can use it with no UI)**
Creates: root config (package.json, turbo.json, biome.json, tsconfig.base.json, CI), `packages/api` (schemas, contract for projects/statuses/tickets/comments/activity/actors/search/system, client factory, events.ts), `apps/server` (config, log, db/*, migrations 0000–0001, services for the same resources, procedures, app.ts, index.ts, routes/events.ts, events/bus.ts, docs route), `packages/cli` (index, actor resolution, output, sse, verbs: projects, statuses, create, show, list, edit, move, comment, comments, sub, delete, search, activity, watch, whoami, open, status, instructions). Tests: db helpers, numbering, inheritance, list/cursor, contract errors, CLI smoke.
Accept: from a fresh clone, `bun dev` then `trellis projects create --key CDE --name Code && trellis create -p CDE -t "First" && trellis move CDE-1 "In Progress" && trellis list --status "In Progress" --json` prints one ticket; `curl -H 'x-trellis-actor: agent:curl' -d '{"project":"CDE","title":"Via curl"}' -H 'content-type: application/json' localhost:4521/api/tickets` returns `CDE-2`; `trellis watch` in another terminal shows both events; `/api/docs` renders.

**M2: web table + ticket page**
Creates: `apps/web` (Vite, router with routes `/`, `/:projectKey`, `/:identifier`, `/settings`), `lib/orpc.ts` (client + `@orpc/tanstack-query`), `lib/live.ts`, `packages/api/src/query-keys.ts`, onboarding, project sidebar tree, ticket table (TanStack Table, sort by column), ticket page (markdown editor/preview, priority/status/parent controls, comments, activity feed), actor name setting, `routes/static.ts`.
Accept: create a ticket in the UI, move it from the CLI, and the table row and ticket page update without a reload; Playwright "create ticket" spec passes.

**M3: kanban + filters + Cmd-K + search**
Creates: kanban route `/:projectKey/board` (dnd-kit, `tickets.move` with after/before), shared filter bar with URL-synced state (`?status=&priority=&q=`), Cmd-K palette (search.query + commands: new ticket, go to project, toggle board/table), status settings page (create/reorder/rename/clear, "customise for this sub-project"), `db/queries/search.ts` trigram path.
Accept: drag a card between columns and `trellis activity CDE-1` shows the status row; Cmd-K `cde-1` and a typo'd title both resolve; table filters persist in the URL; Playwright kanban + filter specs pass.

**M4: PRs + CI live**
Creates: `gh/*`, `pull_requests` migration, `services/pullRequests.ts`, procedures + CLI `pr add|list|rm|refresh`, `projects repos`, web PR card on ticket page (state, draft, checks list with links), CI badge in table/kanban cards, `GhBanner`, `system.gh`, poller tests with the gh stub.
Accept: `trellis pr add CDE-1 <real PR url>` shows checks within a minute; pushing a commit flips the badge to pending then pass; with `gh auth logout` the banner appears and the log shows one line, not a loop; a branch named `CDE-2-foo` gets linked automatically.

**M5: attachments + polish + install command**
Creates: `attachments` migration, `storage/files.ts`, `services/attachments.ts`, `routes/files.ts`, upload procedure, web drag/paste-to-upload in editor and attachment list, CLI `attach|attachments`, `install|uninstall|backup|restore|export|serve|logs`, `system.backup/export`, README/CONTRIBUTING/templates/changesets, keyboard shortcuts on ticket page, empty states.
Accept: `trellis install` from a fresh shell leaves `http://trellis.localhost` serving the built app after a reboot; `trellis attach CDE-1 ./img.png` renders inline on the ticket; `trellis backup` then `trellis restore` on an empty home reproduces the data; the README install steps work on a second machine.

**M6: mobile**
Creates: `apps/mobile` (expo-router: project list, ticket list with status filter, ticket detail with comments and PR status, quick move sheet), `lib/orpc.ts`, `react-native-sse` live hook, server URL setting (defaults to `http://trellis.localhost` when on the same machine's network via a QR code from the web settings page).
Accept: on a device on the LAN, a comment posted from the phone appears on the web ticket page live, and a `trellis move` shows on the phone within a second.

**M7 (after v1)**: `trellis mcp`, thumbnails, Range requests, import, compiled binary.

---

### Critical Files for Implementation
- `/Users/navidkhan/projects/trellis/packages/api/src/contract/index.ts` — the oRPC contract (routes, schemas, typed errors) every client and the server derive from
- `/Users/navidkhan/projects/trellis/apps/server/src/db/schema.ts` — Drizzle schema, enums, generated tsvector, indexes
- `/Users/navidkhan/projects/trellis/apps/server/src/services/tickets.ts` — numbering, status validation/inheritance, move/position, activity rows, event emission
- `/Users/navidkhan/projects/trellis/apps/server/src/gh/poller.ts` — PR/CI cadence rules, gh call shapes, auth state, auto-detection
- `/Users/navidkhan/projects/trellis/packages/cli/src/index.ts` — citty root, actor resolution, JSON/TTY output, exit code mapping