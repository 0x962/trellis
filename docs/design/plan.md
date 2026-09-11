# trellis: a local ticket tracker for agent-driven work

## Context

Navid's dev workflow needs too much management. Tickets live in Linear, review lives in margin, agent runs live in dots, and nothing ties a ticket to the agent that works it or to the PR that closes it. trellis is the missing piece: a local-only ticket tracker, Linear's polish, built for one human who dispatches work to agents and reviews what comes back. No auth, no assignees. Every action carries an actor name and a kind (human or agent). The PR and its CI status live on the ticket, because for agent work the PR is the deliverable and CI is the first reviewer.

Outcome: a repo at `~/projects/trellis` (github.com/0x962/trellis, MIT) that Navid uses daily beside margin and dots, and that is good enough to share.

Decisions made by Navid: name `trellis`; PGlite (embedded Postgres) so the install is one command; a native Expo app for mobile; no shadcn; built with ultracode, every step and every review by a spawned agent; TDD for every agent; builders on Opus 5 or Fable 5.1 at high effort, reviewers at max, plus Astra (`codex exec`, default model `gpt-6-astra`, effort high) as a second reviewer; the brand mockup is the first deliverable after approval.

This plan was produced by two design agents (product, engineering) and corrected by three adversarial critiques (schema, API/REST, performance). The full design documents get committed as `docs/design/*.md` in M0.

## Fixed stack

| Layer | Choice | Version |
|---|---|---|
| Runtime, package manager, tests | Bun | 1.3 |
| Monorepo | Bun workspaces + Turborepo | turbo 2.10 |
| Language, lint, format | TypeScript 7, Biome 2 | 7.0, 2.5 |
| Server | Hono | 4.13 |
| API | oRPC contract-first (`@orpc/contract`, `server`, `client`, `openapi`, `tanstack-query`), Zod 4 | 1.15, 4.5 |
| Database | PGlite + `pg_trgm` contrib, Drizzle ORM, drizzle-kit | 0.5.8, 0.45, 0.31 |
| Web | React 19, Vite 8, TanStack Router, Query, Table v9, Virtual | current |
| UI primitives | Base UI (`@base-ui/react`, the renamed successor of `@base-ui-components/react`), Tailwind v4, own tokens in `packages/ui` | 1.8, 4.3 |
| Editor, palette, dnd, motion, toasts, icons | Tiptap 3, cmdk, `@atlaskit/pragmatic-drag-and-drop`, `motion/mini`, sonner, lucide-react | current |
| Fonts | Inter Variable (`cv11`, `ss01`, `tnum`), JetBrains Mono, preloaded latin subsets | fontsource |
| Mobile | Expo 57, expo-router, React Native 0.87, NativeWind 4, FlashList v2, MMKV, `react-native-sse` | current |
| CLI | `citty`, lazy subcommands, built bundle on install | 0.2 |
| E2E, perf | Playwright (Chromium), a seeded perf suite | current |
| Releases | changesets, GitHub Actions (macOS + Ubuntu) | |

PGlite 0.5.8 ships `pg_trgm` as a loadable contrib module (verified in the tarball). `tsvector` is core.

## Repo layout

```
trellis/
├── package.json  turbo.json  biome.json  tsconfig.base.json  bunfig.toml
├── LICENSE  README.md  CONTRIBUTING.md  AGENTS.md  CHANGELOG.md  .changeset/
├── .github/workflows/ci.yml  ISSUE_TEMPLATE/  PULL_REQUEST_TEMPLATE.md
├── docs/design/product.md  engineering.md  ui-system.md  critiques.md
├── apps/
│   ├── server/   @trellis/server   Hono, oRPC handlers, DB worker (PGlite + Drizzle + services), gh poller
│   ├── web/      @trellis/web      React SPA
│   └── mobile/   @trellis/mobile   Expo
└── packages/
    ├── api/      @trellis/api      Zod schemas, refs, errors, oRPC contract, client factory, event types, query keys
    ├── ui/       @trellis/ui       design tokens, Base UI wrappers, every visual primitive
    └── cli/      @trellis/cli      the `trellis` command, HTTP only
```

Dependency graph is a star: `api` is imported by server, web, mobile, cli (the CLI imports it as `import type` only). `ui` is imported by web only. Packages export TypeScript source and are side-effect free.

Root scripts: `dev` (server 4521 + Vite 5173 with `/api` and `/rpc` proxied), `dev:all` (adds mobile), `build`, `test`, `typecheck`, `lint`, `lint:fix`, `check` (lint, typecheck, test, size budget, 10k perf suite), `perf` (50k suite), `db:generate`, `e2e`, `release`.

Data home `~/.trellis/` (`TRELLIS_HOME` override): `db/`, `attachments/`, `backups/`, `server.log` (rotating 10 MB × 5), `launchd.log`. Port 4521 (`TRELLIS_PORT`), host 127.0.0.1 (`TRELLIS_HOST`; `0.0.0.0` lets a phone on the network reach the server, which has no auth). Served at `http://trellis.localhost` by the gateway on port 80 (margin's). The gateway reads `{ "trellis": 4521 }` from `~/.config/localhost-gateway/routes.json`. `trellis install` sets that entry and `trellis uninstall` removes it.

## Domain rules

- Projects form a tree. A root has a key (`^[A-Z][A-Z0-9]{1,9}$`) and a ticket counter. Tickets are `KEY-n` across the whole tree. Numbers are never reused; deletes leave gaps. A key is immutable once the counter is above zero (`KEY_LOCKED`).
- Nothing moves across roots: ticket, parent, or sub-project (`CROSS_ROOT_MOVE`). A ticket or project cannot be its own ancestor (`PARENT_CYCLE`).
- Statuses belong to a project. A root is seeded with Todo (todo, default), In Progress (started), Agent Review (review, reviewer agent), Human Review (review, reviewer human), Done (done), Canceled (canceled). A sub-project inherits the nearest ancestor's set until it creates its own. Owner(P) = nearest ancestor-or-self that owns statuses. Invariant: `tickets.status_id` belongs to owner(ticket.project). One function `remapScope` restores the invariant on first-status create, clear, re-parent, and project move; match order (name and category) → lowest-position status of the same category → the owner's default. Every status-to-status move is legal. WIP limits are advisory. `category` is immutable after creation.
- `started_at` is set once, on leaving todo. `completed_at` is set on entering done or canceled and cleared on leaving.
- Priority: none | urgent | high | medium | low. No labels in v1. No assignees ever.
- Actor: header `x-trellis-actor: <human|agent>:<name>`, name printable ASCII without `:`, 1–64 chars. Required on every non-GET request (`ACTOR_REQUIRED`, `ACTOR_INVALID`), optional and ignored on GET. `system:trellis` is the poller and internal batches; the header rejects `system`. Optional `x-trellis-session` is stored in `activity.meta.session`. Only name and kind are stored about a person or an agent.
- Agent policy, enforced in the service so curl obeys: an agent cannot move a ticket to a `done` status (`AGENT_CANNOT_COMPLETE`, 403) or delete a ticket or project (`AGENT_CANNOT_DELETE`, 403) without `force: true`.
- Archived project: reads work; every mutation is `PROJECT_ARCHIVED`.
- Optimistic concurrency: `tickets.version` bumps on every row change. `update` and `move` accept `expectedVersion` (or `If-Match: "<version>"`); mismatch is `VERSION_CONFLICT` (412) with the current row. `updated_at` moves only on user-visible activity: ticket fields, a comment, an attachment, a PR link or unlink. Reorders, remaps, and poller CI changes bump `version` but not `updated_at`.
- Hard delete. Ticket delete nulls children's `parent_id` first, cascades comments, attachments, PR links, activity; blobs are garbage collected under the blob lock; one project-level activity row keeps the trace. Project delete needs an empty subtree or `force`.

## Database schema (`apps/server/src/db/schema.ts`)

Ids are ULIDs (`text`) except `activity.id`. Timestamps `timestamptz`, ISO strings on the wire. No `pgEnum`: enum-like columns are `text` with a named `CHECK` (Postgres enums cannot be altered inside the single-transaction migrator). No triggers; every rule is a constraint or a service function that takes `tx`.

| table | columns and constraints |
|---|---|
| projects | id PK, parent_id, root_id NOT NULL, key (UNIQUE, CHECK regex), slug NOT NULL (CHECK `^[a-z0-9]+(-[a-z0-9]+)*$` and not in `board, settings`; roots use `lower(key)`), name (1..120), description ('' md), ticket_template ('' md), ticket_counter int DEFAULT 0, position int, archived_at, created_at, updated_at. UNIQUE (id, root_id). FK (parent_id, root_id) → projects (id, root_id) NO ACTION. UNIQUE NULLS NOT DISTINCT (parent_id, slug). CHECK `(parent_id IS NULL) = (root_id = id)`. CHECK `(parent_id IS NULL) = (key IS NOT NULL)`. CHECK `parent_id <> id`. CHECK `parent_id IS NULL OR ticket_counter = 0`. Index (root_id). |
| repos | id PK, project_id (CASCADE), owner, repo (both CHECK lowercase). UNIQUE (project_id, owner, repo). Effective repos = own + ancestors. |
| statuses | id PK, project_id (CASCADE), name (1..40), slug, category (CHECK set), reviewer (CHECK `(category = 'review') = (reviewer IS NOT NULL)`), color (token name), position int, wip_limit (CHECK > 0), is_default bool, created_at, updated_at. UNIQUE (project_id, name), (project_id, slug). Partial UNIQUE (project_id) WHERE is_default. |
| tickets | id PK, project_id, root_id, number (CHECK > 0), title (CHECK trimmed 1..500), description ('' md), priority (CHECK set, DEFAULT none), status_id (FK statuses RESTRICT), parent_id, position double, version int DEFAULT 1, started_at, completed_at, search tsvector GENERATED (title A, description B, `english`) STORED, created_at, updated_at. UNIQUE (root_id, number). UNIQUE (id, root_id). FK (project_id, root_id) → projects (id, root_id) RESTRICT. FK (parent_id, root_id) → tickets (id, root_id) RESTRICT. CHECK `parent_id <> id`. Indexes: (project_id, status_id, position), (status_id, position, id, project_id, root_id) so a board column reads the index alone, (parent_id), partial (root_id, updated_at DESC) WHERE completed_at IS NULL, partial (root_id, completed_at DESC) WHERE completed_at IS NOT NULL, GIN (search), GIN (title gin_trgm_ops). |
| comments | id PK, ticket_id (CASCADE), body (1..200000), actor_name, actor_kind, search tsvector GENERATED (body, C) STORED, created_at, updated_at. FK (actor_name, actor_kind) → actors. Index (ticket_id, created_at). GIN (search). |
| attachments | id PK, ticket_id (CASCADE), filename (1..255, no `/`), mime, size (CHECK > 0), sha256 (CHECK `^[0-9a-f]{64}$`), actor_name, actor_kind, created_at. FK actor. Index (ticket_id), (sha256). Blob path is a function of the hash: `attachments/<sha[0:2]>/<sha>`. |
| pull_requests | id PK, owner, repo (CHECK lowercase), number (CHECK > 0), url, title, state (open \| closed \| merged), is_draft, head_ref, base_ref, review_state (none \| review_required \| approved \| changes_requested), merged_at, closed_at, checks jsonb `[{name, workflow, bucket, link}]` sorted (CHECK array), ci_state (none \| pending \| pass \| fail), content_hash, fetched_at, fetch_error, created_at, updated_at. UNIQUE (owner, repo, number). Index (state, ci_state). Deleted in the same transaction when its last link goes. |
| ticket_pull_requests | ticket_id (CASCADE), pull_request_id (CASCADE), source (manual \| auto), actor_name, actor_kind, created_at. PK (ticket_id, pull_request_id). Index (pull_request_id). |
| activity | id bigint IDENTITY PK (cursor and sort key), batch_id (ULID), root_id (FK CASCADE), project_id (project at the time, FK CASCADE), ticket_id (nullable, FK CASCADE), actor_name, actor_kind, action, field, from_value, to_value, meta jsonb DEFAULT '{}', created_at. FK actor. CHECK `field <> 'description' OR (from_value IS NULL AND to_value IS NULL)` (description rows carry `meta.deltaChars`; a new description row is skipped when the previous one for the same ticket and actor is under 5 min old). Status rows carry `{fromId, toId, fromCategory, toCategory}` in meta. Indexes (ticket_id, id), (ticket_id, created_at DESC, id DESC) for the last actor of a ticket, (root_id, id), (project_id, id), (created_at). |
| actors | name (CHECK 1..64, no `:`), kind (human \| agent \| system), first_seen_at, last_seen_at. PK (name, kind). Upserted first in every mutating transaction; `last_seen_at` flushed every 30 s from a worker cache. |
| settings | key PK, value jsonb, updated_at. Start-with-agent template, default actor name, stalled threshold. |

Numbering: `UPDATE projects SET ticket_counter = ticket_counter + 1 WHERE id = $root AND parent_id IS NULL RETURNING ticket_counter` (throw on zero rows), then insert, one transaction. A test asserts 50 concurrent creates give 50 consecutive numbers.

Ticket position: new = max + 1024; move = midpoint of the neighbors; renumber the column in steps of 1024 by raw SQL when `next - prev < 1`. The `position` sort keysets by `(position, id)`. The board reads no position.

Migrations: `0000_extensions` created with `drizzle-kit generate --custom` (so the journal has it), body `CREATE EXTENSION IF NOT EXISTS pg_trgm`; `pg_trgm` passed to the `PGlite` constructor; `0001_init` generated. Applied at boot in one transaction, then `ANALYZE`, then `SET pg_trgm.word_similarity_threshold = 0.4`. CI fails on a non-empty `git status --porcelain drizzle/` after `drizzle-kit generate`. `VACUUM (ANALYZE)` on tickets, activity, comments every 10 min when more than 1000 writes happened, and after backup and restore (PGlite has no autovacuum).

## Code organization

Conventions shared by every workspace:

- One folder per module or component: `Name/Name.ts(x)`, `Name/Name.test.ts(x)`, `Name/index.ts` barrel. Co-locate by usage: used once → nested under the user's `components/`; used twice → promoted to the highest shared parent.
- One exported component or service per file. Files over 300 lines get split; a reviewer flags it.
- Tests sit beside the code they test (`*.test.ts`). Fixtures and helpers live in `test/` at the workspace root. Perf and e2e suites are directories, not co-located.
- Layers import downward only. Biome `noRestrictedImports` enforces the arrows below; a violation fails `lint`.
- Names: `camelCase` files for modules, `PascalCase` folders for React components, `kebab-case` for routes and CLI commands. Zod schema `TicketSummarySchema`, type `TicketSummary`, table `tickets`, service `tickets.ts`, procedure file `tickets.ts`, CLI command `list.ts`.

### `packages/api` (the contract; no runtime dependencies beyond zod and oRPC)

```
packages/api/src/
├── index.ts               re-exports contract, client, schemas, errors, events, query keys
├── refs.ts                TicketRef, ProjectRef, StatusRef, ActorHeader: schemas + canonicalize()
├── errors.ts              the declared error map (code → status, data schema); one source for server and clients
├── events.ts              event names and payload schemas
├── query-keys.ts          applyEvent(event, queryClient): patch-first rules, version guard, coalescer
├── client.ts              createTrellisClient(baseUrl, actor, fetch?): RPCLink + typed errors
├── schemas/               one file per resource: project.ts, status.ts, ticket.ts (TicketSummary, Ticket, ListQuery), comment.ts, attachment.ts, pullRequest.ts, activity.ts, inbox.ts, actor.ts, settings.ts, system.ts
├── contract/              one file per resource, same names; index.ts composes the router contract
└── instructions.ts        the AGENTS.md block as a template function (shared by CLI and web)
```

### `apps/server`

```
apps/server/
├── drizzle/               0000_extensions.sql, 0001_init.sql, meta/
├── drizzle.config.ts
├── src/
│   ├── index.ts           boot: config → dirs → blob sweep → DB worker → gh auth (async) → poller → listen
│   ├── config.ts          env → typed config (home, port, maxUploadMb, ghBin, webDist, logLevel, dbInline)
│   ├── log.ts             JSON-lines logger, rotating sink 10 MB × 5, GETs at debug
│   ├── app.ts             Hono app: requestId → logger → cors (dev origins) → bodyLimit → /rpc, /api → routes → static
│   ├── openapi.ts         spec post-processing (Actor header, info, tags, examples, servers)
│   ├── context.ts         request context: actor, session, reqId, services handle
│   ├── db/
│   │   ├── worker.ts      Bun Worker: PGlite + Drizzle + services; priority queue (mutations > reads > search)
│   │   ├── transport.ts   one interface, two implementations: worker (production), inline (tests)
│   │   ├── client.ts      openDb(dataDir | ':memory:') with pg_trgm
│   │   ├── migrate.ts     migrator, ANALYZE, trgm threshold
│   │   ├── schema.ts      tables; enums.ts: the closed sets and CHECK builders
│   │   ├── tx.ts          withTx(fn): tx-first, event collector, flush after commit
│   │   ├── cache.ts       project tree + effective statuses in memory
│   │   ├── maintenance.ts periodic VACUUM (ANALYZE), write counter
│   │   └── queries/       pure query builders, each `(tx, input) => rows`: effectiveStatuses, statusScope, ticketList, board, counts, search, timeline, inbox
│   ├── services/          business rules, `(ctx, tx, input) => result`, throw contract errors, emit events:
│   │                      refs, projects, statuses (remapScope, applyStatusTransition), tickets (numbering, cycle check, move, delete ordering), comments, attachments, pullRequests, activity, inbox, brief, actors, settings, system
│   ├── procedures/        implement(contract).<resource>: resolve refs → service → return; zero logic
│   ├── routes/            plain Hono: events.ts (SSE), files.ts, export.ts, static.ts, docs.ts
│   ├── events/bus.ts      bootId.seq ids, ring buffer, since(), scope filters
│   ├── gh/                run.ts (spawn, slots), graphql.ts (batched query + response mapping), parse.ts (deriveCiState), poller.ts (tick, cadence), detect.ts (auto-link), ratelimit.ts
│   └── storage/blobs.ts   blob lock, finalize(sha), gc(sha), sweep()
└── test/
    ├── helpers/           freshDb(), createTestApp() (oRPC client over app.request), ghStub(), clock()
    ├── stubs/gh.ts        the fake gh binary
    ├── perf/              seed.ts, boot, list, search, memory, attachments, concurrency, backup tests
    └── invariants.ts      assertStatusInvariant(tx), assertBlobInvariant(home)
```

Data flow for one mutation: `procedures/tickets.ts#move` → `services/tickets.ts#move(ctx, tx, input)` inside `withTx` → `queries/*` → activity rows → events queued → commit → events flushed → SSE.

### `packages/ui`

```
packages/ui/src/
├── tokens.css             @theme tokens for light and dark, type scale, spacing, radii, motion durations
├── fonts.css              Inter Variable and JetBrains Mono faces with metric-matched fallbacks
├── index.ts
├── primitives/            one folder per primitive: Button/, IconButton/, Input/, Textarea/, Select/, Popover/, Menu/, Dialog/, Sheet/, Tooltip/, Toast/, Tabs/, Segmented/, Checkbox/, Switch/, Badge/, Chip/, Avatar/, Kbd/, Skeleton/, ScrollArea/, Separator/, EmptyState/, Command/
├── domain/                StatusIcon/, PriorityIcon/, CheckRibbon/, ActorChip/, TicketId/ (trellis-specific visuals used on every surface)
├── hooks/                 useTheme, useReducedMotion, useHotkey
└── gallery/               Gallery.tsx renders every primitive in every state, both themes (served by web at /_gallery)
```

Each primitive: `Button/Button.tsx` (Base UI wrapper + Tailwind classes with tokens only), `Button.test.tsx` (behavior and a11y with Testing Library), `Button.stories.tsx` is not used; the gallery is the visual catalog.

### `apps/web`

```
apps/web/src/
├── main.tsx  router.tsx  app.css
├── routes/                TanStack Router file routes (auto code splitting)
│   ├── __root.tsx         shell: Sidebar, LiveProvider, CommandPalette, Toaster, hotkey scope
│   ├── index.tsx          redirect
│   ├── setup.tsx  settings.tsx  search.tsx  _gallery.tsx
│   ├── needs-you/         route.tsx + components/ (ReviewSection/, FailingCiSection/, StalledSection/, DoneTodaySection/)
│   ├── all/               route.tsx, board.tsx
│   ├── p/$/               route.tsx (splat parser, search schema), board.tsx, components/ProjectSettingsPage/ (lazy chunk)
│   └── t/$identifier/     route.tsx (full page)
├── features/              screen-level modules, each with components/, hooks/, utils/ co-located
│   ├── ticket/            TicketView (shared by peek and page), Header/, Title/, Description/ (ReadOnlyMarkdown, LazyEditor), PropertiesRail/, SubTickets/, Timeline/ (CommentCard/, ActivityLine/, Composer/); TicketView owns the one drop target
│   ├── prs/               PullRequests (GhBanner/, LinkPrField/, RefreshControl/, PullRequestRow/ (PrStateIcon/, CheckCountPill/, CheckRows/, MarginPeek/ (Show diff frames margin, MarginFrame/), PrActions/, MergedNudge/))
│   ├── attachments/       AttachmentGrid (AttachmentRow/, AttachmentActions/, lightbox), AttachmentBox/, DropTarget/, UploadProgress/, hooks/useUploads
│   ├── table/             TicketTable, columns.tsx, GroupHeader/, Row/, BulkBar/, DisplayPopover/, hooks/useTableData (two-tier loading)
│   ├── board/             Board, Column/, Card/, hooks/useBoardDnd, useBoardData
│   ├── filters/           FilterBar, FilterChip/, grammar.ts (URL ⇄ query ⇄ CLI), presets.ts
│   ├── command/           CommandPalette, sections/, actions.ts
│   ├── composer/          CreateTicketDialog, hooks/useComposerDefaults
│   ├── sidebar/           Sidebar, ProjectTree/, ActorFooter/
│   ├── pickers/           StatusPicker/, PriorityPicker/, ProjectPicker/, TicketPicker/ (used by rail, table, board, palette)
│   └── agent/             StartWithAgent/, BriefCopy/
├── lib/                   orpc.ts (client + batch link + tanstack utils), live.ts (EventSource leader, BroadcastChannel), actor.ts (localStorage identity), hotkeys.ts, markdown.ts (render), theme.ts, format.ts (relative time, tabular numbers)
├── stores/                uiStore (sidebar, density, collapsed groups; zustand + localStorage)
└── test-setup.ts
apps/web/e2e/              playwright.config.ts, specs: onboarding, create, approve, live, peek, paint, kanban, filters, command
apps/web/scripts/size-budget.ts
```

### `apps/mobile`

```
apps/mobile/
├── app/                   expo-router: _layout.tsx (tabs), (tabs)/needs-you.tsx, search.tsx, projects/index.tsx, projects/[ref].tsx, settings.tsx, ticket/[identifier].tsx, setup.tsx
├── src/
│   ├── features/          inbox/, ticket/ (PropertyGrid/, PrCard/, Timeline/, Composer/, StatusSheet/, PrioritySheet/), projects/, search/
│   ├── components/        shared RN primitives (Row/, Chip/, StatusIcon/, PriorityIcon/, CheckRibbon/, ActorChip/) mirroring packages/ui tokens
│   ├── lib/               orpc.ts, live.ts (react-native-sse), storage.ts (MMKV persister), server.ts (URL + health check), theme.ts
│   └── theme/tokens.ts    generated from packages/ui/tokens.css by a script, never hand-edited
└── test/
```

### `packages/cli`

```
packages/cli/src/
├── index.ts               citty root, global flags, lazy subCommands, exit-code mapping
├── actor.ts               resolution chain, whoami explanation
├── client.ts              RPCLink with `import type` contract, headers (actor, session, client version)
├── output.ts              TTY tables and key/value blocks vs JSON/JSONL/quiet
├── errors.ts              contract error → exit code + one stderr line
├── sse.ts                 minimal SSE reader for watch
├── instructions.md        imported as text
└── commands/              one file per verb: projects.ts, statuses.ts, create.ts, show.ts, list.ts, edit.ts, move.ts, comment.ts, attach.ts, pr.ts, sub.ts, delete.ts, search.ts, activity.ts, brief.ts, inbox.ts, watch.ts, open.ts, whoami.ts, status.ts, logs.ts, serve.ts, install.ts, backup.ts, restore.ts, export.ts
packages/cli/test/          smoke.test.ts (spawned server), coldStart.perf.ts, actor.test.ts, output.test.ts
```

### Test taxonomy

| kind | where | runs in | what it proves |
|---|---|---|---|
| unit | beside the module (`*.test.ts`) | `bun test`, in-memory PGlite (inline transport) | queries, services, parsers, pure functions, invariants |
| contract | `apps/server/src/procedures/*.test.ts` | `bun test`, oRPC client over `app.request` | routes, refs, errors, actor header, OpenAPI shape, SSE replay and reset, multipart |
| component | beside the component (`*.test.tsx`) | `bun test` + Testing Library + happy-dom | primitives and pickers: behavior, keyboard, a11y roles |
| CLI smoke | `packages/cli/test/` | `bun test`, spawned server on a random port | verbs, JSON shapes, exit codes, stderr contract |
| perf | `apps/server/test/perf/`, `apps/web/scripts/size-budget.ts` | `check` (10k), `perf` (50k) | the budget table |
| e2e | `apps/web/e2e/` | Playwright, temp `TRELLIS_HOME` | user flows, live latency, paint |
| invariant | `apps/server/test/invariants.ts` | called at the end of every service test | status ownership, blob ↔ row consistency |

Rules that came out of the critiques and that a reviewer checks on every PR:

- No module-level `db` outside `db/client.ts` and `db/tx.ts`; `tx` first: every query takes `(tx, input)` and every service takes `(ctx, tx, input)`; nothing that touches the database imports a module-level `db` (a nested query inside a PGlite transaction deadlocks the process). Enforced by a Biome `noRestrictedImports` rule and one test with a 2 s timeout.
- The DB worker keeps PGlite's synchronous WASM execution off the thread that serves HTTP, SSE, gh pipes, and uploads. Search requests carry a client id; a newer one drops a superseded one before it runs. Search has `SET LOCAL statement_timeout = 200`.
- `withTx` queues events and flushes them after commit.
- Shutdown: stop accepting → SSE `bye {reason}` → poller drain (5 s deadline) → worker close → exit 0.
- Backup: the worker runs `CHECKPOINT` and copies `db/` and `attachments/` to `backups/snapshot-<stamp>` by reference (`cp -c` on APFS), so it holds the queue for the checkpoint and the copy only. The HTTP process then runs `tar -czf` over the snapshot into `trellis-<stamp>.tar.gz.partial`, renames it when tar exits 0, and removes the snapshot. A failed backup removes the snapshot and the partial file; boot removes both when a backup stopped with its process. Export streams NDJSON per table in 1000-row keyset pages.

## API contract (`packages/api/src/contract/*.ts`)

Two handlers over one router: `RPCHandler` at `/rpc` (typed clients) and `OpenAPIHandler` at `/api` (curl, agents, Scalar at `/api/docs`, spec at `/api/openapi.json`). `ResponseHeadersPlugin` sets `Location` on creates and `x-trellis-api-version` on every response. The spec is post-processed so a first-time agent can work from `/api/openapi.json` alone.

Ref grammars (case-insensitive in, canonical out):

| ref | grammar | examples |
|---|---|---|
| TicketRef | ULID or `KEY-n` | `CDE-42` |
| ProjectRef | ULID, `KEY`, or `KEY.slug(.slug)*` (dots, so it survives a path segment) | `CDE`, `CDE.web.auth` |
| StatusRef | ULID, slug, name, or `category:<category>` (first status of that category) | `in-progress`, `In Progress`, `category:review` |

| procedure | route | notes |
|---|---|---|
| projects.list | GET /api/projects?archived= | flat: id, parentId, rootId, key, slug, path, name, depth, position, openCount, needsYouCount, archivedAt |
| projects.get | GET /api/projects/{project} | ancestors, children, repos, effective statuses, statusesInheritedFrom, ticketTemplate |
| projects.create | POST /api/projects | 201 + Location; key required without parent, forbidden with |
| projects.update | PATCH /api/projects/{project} | name, slug, description, ticketTemplate, archived |
| projects.move | POST /api/projects/{project}/move | parent?, after?, before? |
| projects.delete | DELETE /api/projects/{project}?force= | 200 `{deleted}` |
| projects.setRepos | PUT /api/projects/{project}/repos | full replace, idempotent |
| statuses.list / create / update / reorder | GET, POST /api/projects/{project}/statuses; PATCH …/{status}; PUT …/order | update: name, color, reviewer, wipLimit, isDefault (category immutable) |
| statuses.delete | DELETE /api/projects/{project}/statuses/{status}?moveTo= | `moveTo` must be in the same project; STATUS_IN_USE without it |
| statuses.clear | DELETE /api/projects/{project}/statuses | sub-projects only; ROOT_STATUSES on a root |
| tickets.list | GET /api/tickets | flat query grammar below; `{items: TicketSummary[], nextCursor}`; no total |
| tickets.counts | GET /api/tickets/counts | same filters; `{total, byStatus: [{statusId, count}]}` |
| tickets.board | GET /api/tickets/board?project= | one query: `{columns: [{statusId, count, items: first 100 by (updatedAt, id) descending}]}`; more via `list` with `status=` |
| tickets.get | GET /api/tickets/{ticket} | full ticket + project, status, parent, children, prs, attachments, commentCount, version |
| tickets.create | POST /api/tickets | project, title, description?, priority?, status?, parent?; 201 + Location |
| tickets.update | PATCH /api/tickets/{ticket} | title, description, priority, status, parent (ref or null), project, expectedVersion?; `If-Match` maps to expectedVersion |
| tickets.move | POST /api/tickets/{ticket}/move | status, after?, before?, force?, expectedVersion?; anchors must be in the target column |
| tickets.updateMany / deleteMany | POST /api/tickets/update-many, delete-many | ≤200 refs, one batch, one transaction |
| tickets.delete | DELETE /api/tickets/{ticket}?force= | 200 `{deleted: "CDE-42"}` |
| timeline.list | GET /api/tickets/{ticket}/timeline?before=&limit= | comments and activity merged, newest first, 100 per page |
| comments.create / update / delete | POST /api/tickets/{ticket}/comments; PATCH, DELETE /api/comments/{id} | |
| attachments.list / upload / get / delete | GET, POST (multipart) /api/tickets/{ticket}/attachments; GET, DELETE /api/attachments/{id} | bytes at plain `GET /api/attachments/{id}/file` |
| pullRequests.list / link / unlink / refresh | GET, POST /api/tickets/{ticket}/prs; DELETE /api/tickets/{ticket}/prs/{id}; POST /api/prs/{id}/refresh | link is idempotent (200 with the existing row); INVALID_PR_URL; stores with fetchError when gh is down |
| pullRequests.diff | GET /api/prs/{id}/diff | `gh pr diff`, 1 MB cap → `{truncated, url}`, cached 60 s |
| search.query | GET /api/search?q=&project=&limit= | tickets + projects |
| inbox.get | GET /api/inbox?project= | `{review, failingCi, stalled, doneByAgentsToday}`, each `{items, total}`, cap 100 |
| brief.get | GET /api/tickets/{ticket}/brief | `{markdown, generatedAt}` |
| actors.list / default | GET /api/actors, /api/actors/default | |
| settings.get / set | GET, PUT /api/settings | |
| system.health / gh / backup | GET /api/health `{ok, version, apiVersion, bootId, rss, db, gh}`; GET /api/gh; POST /api/backup | |
| export | plain `GET /api/export` | NDJSON stream, `Content-Disposition: attachment` |

`TicketSummary` (list, board, events): id, identifier, number, title, priority, status {id, slug, name, category, reviewer, color}, project {id, key, path}, parent {id, identifier} | null, childCount, childDoneCount, commentCount, attachmentCount, pr {state, ciState, pass, fail, pending} | null, lastActor {name, kind, at} | null, position, version, createdAt, updatedAt, completedAt. About 300 bytes. The description is only in `get`.

`tickets.list` grammar, identical in the API, the web URL, and the CLI flags:

| param | values |
|---|---|
| project | ProjectRef; `subprojects=false` narrows to that project |
| status | StatusRef list |
| category | list of todo, started, review, done, canceled |
| reviewer | human or agent |
| priority | list |
| parent | TicketRef or `none` (top-level only) |
| pr | any, none, open, draft, merged, closed |
| ci | list of pass, fail, pending, none |
| actor | `kind:name` or `name` (last actor) |
| q | FTS with prefix on the last token, no trigram |
| updated, created, completed | ISO "after" bounds; the CLI and web translate `24h`, `30d` |
| sort | `[-]updatedAt` \| createdAt \| priority \| number \| status \| position; default `-updatedAt`; tiebreak id desc |
| cursor, limit | opaque cursor bound to a hash of filter + sort (INVALID_CURSOR on mismatch); limit 1–200, default 50 |

Example, identical on the three surfaces:
```
GET /api/tickets?project=CDE&status=in-progress,agent-review&parent=none&ci=fail&sort=-updatedAt
/p/CDE?status=in-progress,agent-review&parent=none&ci=fail&sort=-updatedAt
trellis list --project CDE --status in-progress,agent-review --parent none --ci fail --sort -updatedAt
```

Errors, all declared on the contract (`{defined, code, status, message, data}`): INPUT_VALIDATION_FAILED 400 (issues), ACTOR_REQUIRED 400, ACTOR_INVALID 400 (grammar), INVALID_CURSOR 400, INVALID_PR_URL 400, AGENT_CANNOT_COMPLETE 403, AGENT_CANNOT_DELETE 403, NOT_FOUND 404 (kind, ref), DUPLICATE 409 (field), KEY_LOCKED 409, STATUS_NOT_IN_PROJECT 409 (valid list), STATUS_IN_USE 409 (count), LAST_STATUS 409, ROOT_STATUSES 409, STATUS_CATEGORY_IMMUTABLE 409, CROSS_ROOT_MOVE 409, PARENT_CYCLE 409, PROJECT_NOT_EMPTY 409, PROJECT_ARCHIVED 409, INVALID_ANCHOR 409, VERSION_CONFLICT 412 (current), PAYLOAD_TOO_LARGE 413, GH_UNAVAILABLE 503 (reason).

Versioning: no prefix. `apiVersion` in health and in `x-trellis-api-version`; additive changes only within a version. The CLI sends `x-trellis-client: cli/<semver>` and exits 7 when the server is older than it.

## Live updates

Event id `<bootId>.<seq>` (bootId is a ULID minted at boot). `GET /api/events?since=&types=&project=&ticket=`; `Last-Event-ID` wins. On connect: `reset {reason: restart | gap}` when the id is from another boot or below the ring floor, then `ready {id, bootId, serverVersion, apiVersion}`. `: ping` every 15 s (25 s for mobile via `?ping=`). `bye {reason}` on shutdown. `types=ticket.*,pr.updated`.

Payloads: `ticket.created | updated | deleted {summary: TicketSummary, fields[], batchId}`, `pr.linked | unlinked | updated {id, ticketIds, state, ciState}`, `comment.* | attachment.* {id, ticketId}`, `statuses.changed {projectId}`, `project.* {id}`, `gh.status {ok, reason}`.

Client rule (`packages/api/src/query-keys.ts#applyEvent`): patch first, invalidate rarely. A `ticket.*` event patches every cached list, board, inbox, search, and detail entry that holds the id with `setQueryData`, applied per entry only when `incoming.version > entry.version`, which sets `entry.version = incoming.version`; there is no other version bookkeeping. A queued or in-flight refetch never blocks a patch. A detail entry whose event fields include `description` keeps its old text, gets `descriptionStale: true`, and is invalidated through the coalescer; the refetch replaces the entry and clears the flag. The description editor refuses to save while `descriptionStale` is true. While a mutation is in flight for that id, patches queue and apply in version order after settle. Invalidation happens only when membership or order can change (status, project, priority, parent, completed, create, delete) through a coalescer (250 ms trailing, 1 s max). `inbox.get` invalidation debounced 1 s. Mutations `setQueryData` from their response and invalidate on error only. `staleTime: Infinity` for SSE-patched entities; `reset` and reconnect invalidate all.

Web: one EventSource per origin. The tab holding `navigator.locks("trellis-sse")` owns it and rebroadcasts over `BroadcastChannel`. Mobile: `react-native-sse` in the foreground only; on foreground, invalidate all instead of replaying. CLI `watch`: JSON lines, server-side scope filters.

## PR and CI polling (`apps/server/src/gh/`)

One `gh api graphql` request per 50 PRs, aliased `repository(owner, name) { pullRequest(number) { number title state isDraft url headRefName baseRefName mergedAt closedAt reviewDecision commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { nodes { ... on CheckRun { name status conclusion startedAt detailsUrl checkSuite { workflowRun { event workflow { name } } } } ... on StatusContext { context state targetUrl createdAt } } } } } } } } }`. One process per tick regardless of PR count. `link` and `refresh` use the same query for one PR. Rows are written only when a content hash changes. GitHub keeps a re-run beside the run it replaces, so `normalizeChecks` keeps one node per name, workflow, and event (a StatusContext per context name) and takes the node that started last, as `gh pr checks` does.

Cadence: pending checks 30 s; open, not pending 120 s; merged or closed within a day 10 min; never for PRs on done or canceled tickets or older closed PRs. `gh api rate_limit` every 5 min; under 20% remaining, intervals × 4 and a `gh.status` event. Slots: 2 poller, 1 interactive (diff, refresh, link). gh missing or unauthenticated: recheck every 60 s, one log line per state change, a banner in the web and one line in the CLI, no crash loop.

Auto-link every 120 s: one `gh pr list --repo <o/r> --state open --limit 100 --json number,url,title,headRefName,body` per declared repo; regex `/\b([a-z][a-z0-9]{1,9})-(\d+)\b/gi` over title + branch + body, key uppercased; links as `system:trellis` with `source = auto`. Branch names are lowercase (`cde-42-slug`), so the acceptance test uses `cde-2-foo`.

`ci_state` = `deriveCiState(checks)`: any fail or cancel → fail; else any pending → pending; else any pass → pass; else none. Unit-tested. "Tickets with a failing check named X" is `checks @> '[{"name":"X","bucket":"fail"}]'`.

Tests drive `poller.tick()` with a stub gh script (`TRELLIS_GH_BIN=test/stubs/gh.ts`, replies from `TRELLIS_GH_STUB_FILE`, which also counts spawns).

## Attachments

Multipart via oRPC `z.file()`, Hono `bodyLimit` 50 MB (`TRELLIS_MAX_UPLOAD_MB`). Hash with `Bun.CryptoHasher` over `file.stream()` in 1 MB chunks while writing `attachments/tmp/<ulid>`, then `finalize(sha)` under the blob lock (rename or dedupe, then the DB row). `gc(sha)` under the same lock after a delete commits. Boot sweep (before the server accepts requests) unlinks files without rows and empties `tmp/`.

Serving `GET /api/attachments/{id}/file` with `Bun.file`: `Content-Type` from the recorded mime, `ETag: "<sha>"`, `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`. Inline only for the exact allowlist `image/png, image/jpeg, image/gif, image/webp, image/avif, application/pdf, text/plain, text/markdown, video/mp4, video/webm`; everything else, including SVG and HTML, is `Content-Disposition: attachment` (an inline SVG on the app origin is stored XSS). No thumbnails and no Range in v1.

## Search

`KEY-n`: the exact ticket first, then the FTS hits of the same text, in one statement; no trigram path and no project list. Any other text: FTS `websearch_to_tsquery('english', q) || to_tsquery('english', last || ':*')` over `tickets.search` and `comments.search` (grouped by ticket) ranked by `ts_rank`; unioned with `title <% q` ranked by `word_similarity` when `q.length >= 3`; text hits sort first, so the trigram index runs only when the text hits fill less than the page; deduped, limit 20, 200 ms statement timeout. Client: 120 ms debounce, one in-flight search, superseded ones dropped on both sides.

## Performance requirements

Budgets are for Navid's Mac against a deterministic seed (`apps/server/test/perf/seed.ts`: N tickets across 3 roots × 8 projects, 10 activity rows and 2 comments per ticket, 2 KB descriptions, 40 open PRs). The 10k seed runs in `bun run check`; the 50k seed runs from a cached data dir in `bun run perf`. CI enforces the same tests at 2.5× the budget.

| metric | target | test |
|---|---|---|
| Cold boot to `/api/health` 200 | ≤ 1.5 s warm data dir, ≤ 3.5 s first run | perf/boot |
| `tickets.list` p95, default table query, 50 rows | 1k 5 ms, 10k 10 ms, 50k 20 ms; with `q` 40 ms | perf/list (`Server-Timing`) |
| `tickets.board`, `tickets.counts` at 50k | 30 ms each | perf/list |
| `search.query` p95 at 50k | 40 ms; `KEY-n` 3 ms | perf/search |
| SSE commit to repaint | patch path ≤ 100 ms; invalidation path ≤ 500 ms | e2e/live |
| Kanban drop | optimistic paint within 16 ms; `move` server p95 ≤ 20 ms; rollback exercised | e2e/kanban |
| Ticket open | peek from cache ≤ 50 ms summary, ≤ 100 ms body; cold ≤ 250 ms; `j`/`k` step ≤ 50 ms | e2e/peek |
| Web bundle | initial JS ≤ 220 KB gz; Tiptap ≤ 200 KB lazy; diff ≤ 350 KB lazy; total ≤ 900 KB; fonts ≤ 160 KB | scripts/size-budget in `check` |
| First paint | FCP ≤ 300 ms; rows ≤ 600 ms cold, ≤ 150 ms warm | e2e/paint |
| Server RSS at 50k | ≤ 350 MB idle, ≤ 550 MB peak | perf/memory |
| Poller | ≤ 1 gh process per 50 due PRs per tick; ≤ 1200 GitHub requests/h with 20 pending PRs; ≤ 250 ms CPU per tick | gh/poller.perf |
| Upload | 50 MB ≤ 1 s; event-loop stall ≤ 50 ms; serve 50 MB ≤ 300 ms | perf/attachments |
| CLI | `--help` ≤ 60 ms; `list --json` ≤ 150 ms p95 built, ≤ 300 ms from source | cli/perf |
| Mutations under 5 concurrent agents | ≤ 15 ms server time each; 20 writes/s with list p95 still in budget | perf/concurrency |
| Logs on disk | ≤ 60 MB ever | log rotation test |
| Backup at 50k | hold ≤ 1.5 s; total ≤ 15 s | perf/backup |
| Mobile | 500-row list ≥ 55 fps; cold open ≤ 1.5 s; reconnect ≤ 1 s | manual, recorded in the M6 review verdict |

Design consequences already applied above: DB worker, `TicketSummary` everywhere but `get`, `board` and `counts` instead of `total` and `limit 500`, patch-first events with `version`, batched GraphQL polling, trimmed and partial indexes, `ANALYZE` and periodic vacuum, in-memory project cache with `project_id = ANY($1)`, `timeline.list` and a batched oRPC link on the ticket page, `import type` contract in the CLI, streamed export and spawned tar backup, rotating logs.

Web consequences: the table loads active tickets in full (cap 2000, banner above that) and groups client-side; Done and Canceled groups load per group on expand; the peek renders markdown read-only and mounts Tiptap on `e` or click, with the chunk preloaded on idle and one editor instance reused; diff files collapsed beyond the first 10, per-file render in `startTransition`, highlighting off above 1500 changed lines; `motion/mini` and CSS transitions only (Biome rule); TanStack Router auto code splitting; fonts preloaded with a metric-matched fallback; theme set by an inline head script before first paint; cards and rows memoized with structurally shared list patches; fixed row heights.

## CLI (`packages/cli`)

Global flags: `--json`, `--jsonl`, `--quiet` (one identifier per line), `--as <kind:name | name>`, `--url` (`TRELLIS_URL`, default `http://127.0.0.1:4521`), `--no-color`.

| verb | flags |
|---|---|
| `projects list \| create \| show \| move \| repos` | `--key --name --parent --description`, `--add o/r --remove o/r` |
| `statuses list \| add \| edit \| rm \| clear` | `--category --reviewer --color --position --default`, `--move-to` |
| `create` | `-p --project -t --title -d --description <text \| -> --priority --status --parent` |
| `show <ticket>` | `--comments --activity --prs` |
| `list` | the shared grammar as flags: `--project --subprojects --status --category --reviewer --priority --parent --pr --ci --actor --q --updated --created --completed --sort --limit --all` |
| `edit <ticket>` | `--title --description --priority --parent --project --status --expect-version` |
| `move <ticket> <status>` | `--after --before --force` |
| `comment <ticket>` / `comments <ticket>` | `--body <text \| ->` |
| `attach <ticket> <path>` / `attachments <ticket>` | `--name` |
| `pr add \| list \| rm \| refresh \| diff` | |
| `sub <ticket>` | same as `create`, parent fixed |
| `delete <ticket>` | `--yes --force` |
| `search <q>` / `activity <ticket \| --project>` / `brief <ticket>` / `inbox` | |
| `watch` | `--project --ticket --type --since` |
| `open <ticket>` | prints `http://trellis.localhost/t/CDE-42`; `--browser` |
| `whoami` / `instructions [--project]` / `status` / `logs` | |
| `serve` / `install` / `uninstall` / `backup` / `restore` / `export` | `--no-launchd --superset-bin` |

Actor resolution: `--as` → `TRELLIS_ACTOR` → kind `agent` only when `CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_SESSION_ID`, or `CODEX_*` is set (TTY state changes output format, never kind); agent names `claude-code`, `codex`, else `agent`; humans `git config user.name` (NFKD, diacritics stripped, one-time hint to set `TRELLIS_ACTOR`) else the OS user. `x-trellis-session` from `CLAUDE_CODE_SESSION_ID`, else `CLAUDE_SESSION_ID`. `whoami` prints the chain.

Output: TTY → aligned text; non-TTY or `--json` → the procedure output (lists follow cursors up to `--limit`, default 50, `--all` for everything, streamed page by page). Errors: one stderr line `error: <message> (<CODE>)`. Exit codes: 0 ok, 1 server error, 2 usage, 3 not found, 4 refused or conflict, 5 unreachable (message names `trellis install` and `bun dev`), 6 gh unavailable, 7 client too old.

`trellis instructions` prints the AGENTS.md block (`packages/cli/src/instructions.md`): identify (automatic inside Claude Code), pick (`list --status todo`), read (`show --comments`), start (`move in-progress`), branch must contain the identifier, split (`sub`), ask (`comment`, then `watch --ticket`), finish (`move agent-review`, then `human-review` when CI is green), never Done, never delete, plus the honest curl one-liner with both headers. MCP server: M7.

## Web product (full spec in `docs/design/product.md`)

Routes: `/` → `/needs-you` (or `/setup` on first run); `/needs-you`; `/all`, `/all/board`; `/p/CDE`, `/p/CDE/board`, `/p/CDE/web/auth[/board]`, `/p/CDE/settings`; `/t/CDE-42`; `/search?q=`; `/settings`. The web URL keeps slashes; refs go to the API as `CDE.web.auth`. View state in search params with the shared grammar plus `group, scope, peek, density`; defaults never written to the URL; "Copy as CLI" emits the equivalent `trellis list …`.

Ticket surfaces: side peek by default (`?peek=CDE-42`, 720 px, resizable, `j`/`k` walk the list), full page `/t/CDE-42` (`o`), never a modal.

Ticket page: sticky header (breadcrumb `CDE › web › auth · CDE-12 Parent`, Start with agent ▾, Copy ID, … menu), ID + editable title, description (read-only markdown, Tiptap on `e` or click, markdown in/out, slash menu, autosave 800 ms with `expectedVersion`; a 412 shows "changed by agent:claude-code: reload or overwrite"), sub-tickets with a progress bar, PR rows, attachments, one interleaved timeline (`timeline.list`; comments as cards, activity as 32 px lines, same-actor runs within 5 min collapsed), composer pinned at the bottom. Properties rail 280 px: status, priority, project, parent, sub-tickets, branch (derived `cde-42-slug`, copy), created, updated.

PR row: state icon (open green, draft dashed gray, merged violet, closed red), `o/r #123 Title`, the **check ribbon** (64×6 segmented bar, one segment per check in run order up to the box width in px, above that one segment per run of same-bucket checks with a 1 px minimum for a failing run; shimmer while pending), pill ✓ n · ✕ n · ○ n, review-state chip, branch → base, updated; expand to per-check rows (failing first, links); a Show diff control that opens a modal sheet, up to 1240 px wide, which frames `margin.localhost/<pr-url>` (Navid, 2026-09-10: margin is the review surface on this machine, so trellis renders no diff of its own; the diff belongs beside the ticket, so the sheet takes no second tab). margin is a service on this machine and it can be down, and a frame of a dead service shows the error page of the browser. So the sheet also asks `margin.localhost` with a `no-cors` request, and it names the margin address as a link when that request fails. The frame waits for no answer: Chromium holds an opaque cross-origin reply for 3.7 s to 5.0 s against a live margin, and it fails in about 2 ms against a port that nothing listens on. A merged PR on a review-status ticket shows "PR merged, mark Done?".

Actors: human = filled circle with initials; agent = rounded-square outline in the agent color with `⟡` and a mono chip `⟡ claude-code · agent`; live dot when the agent acted within 5 min; agent comments carry an agent-colored left border; `system` never shows as an actor. Clicking an actor filters the list.

Table: active tickets fetched in full and grouped client-side by status in category order, rows sorted priority desc then updated desc; Done and Canceled collapsed and paged per group, rendered only when no status filter is active; columns priority, ID, title (with `↳ parent`, sub ring, clip, comment count), status, PR (icon + mini ribbon), project (when scoped), last actor, updated; inline status and priority popovers; `x` select, bulk bar (`updateMany`); Display popover for columns, density, group, sort; virtualized with fixed row heights.

Kanban: `tickets.board`, pragmatic-drag-and-drop, columns by effective status in category order (category columns on `/all/board`), each column listing the last updated ticket first, 100 cards per column then "show more"; card = ID, priority, two-line title, PR icon + mini ribbon, sub ring, clip, last actor + time; a failing-CI card gets a 2 px red top border; drop = `tickets.move`; WIP badge; collapsed columns; the column plus and the ghost row open the composer.

Filters: Linear-style chips over the shared grammar; presets Active, Needs review, Failing CI, Touched by agents today. No saved views in v1.

Cmd-K: This ticket, Selection, Create, Go to, View, Search results (top 6, 120 ms debounce, `KEY-n` jumps). Keyboard map: `Cmd+K`, `/`, `c`, `?`, `g h|a|p|b|t|s`, `[`, `Cmd+\`, `j k`, `Enter`, `o`, `x`, `s`, `p`, `Shift+P`, `m`, `[ ]` on a card, `a` approve, `r` send back, `e`, `Shift+C`, `Cmd+Enter`, `Cmd+Shift+Enter`, `Cmd+C`, `Cmd+Shift+C`, `Cmd+.`, `Cmd+Shift+A`, `Cmd+Shift+B`, `Backspace`, `1`–`9`.

Create: centered composer 640 px, title, description prefilled from `ticketTemplate`, chip row project/status/priority/parent, defaults from the current filters, `Cmd+Enter`, `Cmd+Shift+Enter` create and continue, draft in sessionStorage.

Needs you (home; the sidebar badge counts every section): Review (reviewer human, oldest waiting first; `a` approve → lowest-position done, `r` send back → lowest-position started with a comment), Failing CI ("Re-run with agent" appends the failing check names), Stalled (started, `updated_at` older than the threshold), Done by agents today (collapsed). Approve animates the row out. Empty state: "Nothing needs you. 3 tickets in progress by agents."

Start with agent: primary button, copies `claude "$(trellis brief CDE-42)"` (template in settings), optional "also mark In Progress", dropdown for prompt only / brief markdown / CLI cheat-sheet.

First run `/setup`: name, then first project with an auto-suggested key. Skeletons shaped like the real rows for ≤ 300 ms, never on cached navigation. Optimistic for status, priority, project, parent, order, title, comment, create; rollback with a toast and Retry. SSE reconnect with backoff, "Reconnecting" after 3 s, "Server restarting" on `bye`.

Accessibility: every action reachable by keyboard; table `role=grid` with roving tabindex; board lists with live-region announcements and the status picker as the documented equivalent of drag; peek `role=dialog` non-modal; color never the only signal; text ≥ 4.5:1; reduced motion turns slides into fades and stops the live dot and shimmer.

## Mobile (Expo)

Tabs: Needs you, Search, Projects, Settings. Ticket is a stack push titled by ID. Server setup (URL, Test connection via `/api/health`, name; QR from web settings). Needs you rows: swipe right approve, left send back. Ticket: title, property grid, rendered description, sub-tickets, PR cards with ribbon, attachments (`expo-image`, inline under 3 MB), timeline, composer; editable: status, priority, comment, approve / send back. FlashList v2 with fixed-height summary rows; MMKV persister capped at 5 MB, 24 h; SSE foreground only, 25 s ping, invalidate all on foreground; "Offline, showing cached data" banner; no push in v1.

## UI system (`packages/ui`, full spec in `docs/design/ui-system.md`)

No third-party styled components. Base UI (`@base-ui/react`) gives behavior and accessibility; every visual is ours.

- Type: Inter Variable (`cv11 ss01`, `tnum` on IDs, counts, times), JetBrains Mono for chips, branches, code. Scale 11/12/13/14/16/20/24; weights 400/500/600.
- Space 4 px base; radii 4/6/8/12; outer = inner + padding.
- Tokens are Pierre's palette (Navid's call, 2026-09-08; values verbatim from `@pierre/theme` 2.0.0 and `@pierre/diffs` 1.4.1), light / dark: `bg #F5F5F5/#0A0A0A`, `surface #FFFFFF/#111111`, `elevated #FFFFFF/#171717`, `border #E5E5E5/#1F1F1F`, `border-strong #D4D4D4/#2A2A2A`, `fg #0A0A0A/#FAFAFA`, `fg-muted #737373/#A3A3A3`, `fg-faint #A3A3A3/#737373`, `accent #009FFF` (both), `accent-soft #DFEBFF/#19283C`, `agent #693ACF/#9D6AFB` (Pierre's syntax purple), `agent-soft #EFE8FB/#24183F`, `success #0DBE4E/#5ECC71`, `warning #D5A910/#FFD452`, `danger #FF2E3F/#FF6762`, `scrim`. True neutral greys, no hue bias. Dark mode swaps shadows for a 1 px strong border. The diff view uses `pierre-light` / `pierre-dark` so code and chrome share one palette.
- Status by category: todo faint empty circle; started warning half ring (sub-ticket progress fills it); review accent dotted ring (agent variant carries `⟡`); done success filled check; canceled faint × with strikethrough. Priority: Linear bars in `fg-muted`; urgent a filled danger square with `!`.
- Motion: 120 ms hover, 160 ms popover, 240 ms peek slide, 160 ms row enter, 200 ms approve sweep. Never animate re-sorts, text changes, counters, skeleton swaps, theme switch.
- Focus: `:focus-visible` 2 px accent outline; rows and cards use an inset left bar.
- Theme: dark is the default (Navid's call, 2026-09-09); `useTheme` starts at `dark` on first run and the inline head script stamps `data-theme="dark"` before first paint; light and system stay selectable in settings.
- Primitives built once: Button, IconButton, Input, Textarea, Select, Popover, Menu, Dialog, Sheet, Tooltip, Toast, Tabs, Segmented, Checkbox, Switch, Badge, Chip, Avatar (human/agent), StatusIcon, PriorityIcon, CheckRibbon, Kbd, Skeleton, ScrollArea, Separator, EmptyState, Command. A `/_gallery` route renders all of them in both themes for the design reviewer.
- Signature details: the check ribbon, agent chips with the live dot, the approve sweep, the Start-with-agent toast with the command in mono.

## Orchestration: how we build it

Ultracode is on. I lead; every step is an agent. One Workflow per milestone; I read the verdicts between milestones and merge.

Every work item is test-driven. The spec states outcomes; an agent turns the outcomes into failing tests before any implementation; the builder makes them pass without touching them. A change without a test does not merge.

Per work item (a package, a feature, a screen):

1. **Specify** (effort high): rewrite the item's spec section as numbered outcomes (given / when / then), each mapped to a test name and kind: unit (`bun test`, fresh in-memory PGlite, inline transport), contract (oRPC client over `app.request`), CLI smoke (spawned server), e2e (Playwright), perf (seeded budget). Returned as structured output; I approve or edit.
2. **Test** (effort high, worktree): write those tests and nothing else; each fails for the right reason; the failure lines are returned as evidence.
3. **Build** (Opus 5 or Fable 5.1, effort high, same worktree): implement until green; may add tests, never delete or weaken one; a test believed wrong comes back to me with the reason; runs `bun run check` and reports the output.
4. **Review panel** (parallel, effort max, verdict schema `{findings: [{file, line, severity, claim, evidence}], approve}`):
   - Test reviewer: are the tests real, do they cover every outcome, would a plausible bug pass them, is any tautological.
   - Claude correctness reviewer (refute-first).
   - Astra reviewer: a wrapper agent runs `codex exec` in the worktree with the same prompt and returns Astra's findings verbatim, tagged `astra`.
   - Code-quality reviewer against the repo rules (STE comments, no fallbacks, no dead code, tokens only, tx-first, file size).
   - Design reviewer for UI items: runs the app, captures light and dark at 1440 and 390 px (CDP), grades against the checklist, attaches screenshot paths.
5. **Fix loop**: findings with two agreeing reviewers, or any blocker, go to a fix agent; a missing case becomes a failing test first; re-review; until a round is dry (max 3 rounds, then it escalates to me).
6. **Merge**: I read the verdicts, the test list, and the diff summary, then merge. Nothing merges on a single reviewer's word.

Brand mockup, the first deliverable after approval: one artifact page in the proposed fonts, tokens, and primitives (Base UI + Tailwind v4), both themes, showing Needs you, a table group, one kanban column, and a ticket page with a PR row and the check ribbon. Navid reacts before any code. Its tokens become `packages/ui/tokens.css`.

Design gate before M2: a design canvas (the `design` skill) with the five reference screens, light and dark, revised from the mockup feedback. Navid marks it up; the primitives get built from the approved canvas.

Design checklist (the design reviewer's rubric): optical alignment; tabular numbers; hover, active, focus, disabled states; no layout shift on data arrival; hit areas ≥ 28 px desktop, 44 px mobile; contrast; density per spec; motion durations per token table; reduced motion; empty, loading, error states; no raw color or spacing literal outside `packages/ui` (Biome rule and a dots `design-tokens` checker).

Repo rules for every agent (`AGENTS.md`): STE for prose and comments; happy path only; no fallbacks; comments explain invariants; `tx` first; commit subject = user-visible result; every PR has one verification sentence; `bun run check` green before hand-off.

## Milestones

**M0 Scaffold and design system.** Repo, workspaces, turbo, Biome (including the `db/client` and `motion` import rules), tsconfig, CI, LICENSE, AGENTS.md, `docs/design/*` (product, engineering, ui-system, critiques), `packages/ui` tokens and primitives with `/_gallery`, `packages/api` skeleton (refs, errors, event types), the perf seed script. Mockup, then design canvas gate. Accept: `bun run check` green on a fresh clone; the gallery renders every primitive in both themes; Navid approves the canvas.

**M1 Server, DB, CLI.** Schema, migrations, DB worker with both transports, services (`remapScope`, transitions, numbering, cycle check, blob lock), procedures, SSE, OpenAPI post-processing, boot, rotating logs, full CLI. Perf suite at 10k in `check`. Accept: `trellis projects create --key CDE --name Code && trellis create -p CDE -t First && trellis move CDE-1 in-progress && trellis list --status in-progress --json` prints one summary; the curl one-liner returns `CDE-2` with a `Location`; `trellis watch` shows both events; `trellis move CDE-1 done` as an agent exits 4; a nested-query test proves the tx rule; 50 concurrent creates number consecutively; `/api/docs` renders and the spec carries the actor header on every mutation; list p95 at 10k under budget.

**M2 Web: shell, table, ticket page, Needs you.** Router, oRPC client with batch link, `applyEvent` patch-first with the coalescer, single EventSource per origin, setup, sidebar tree, two-tier table, peek and full page, read-only markdown with lazy Tiptap, timeline, composer, actor chips, Needs you, settings, size budget, font preload, pre-paint theme. Accept: create in the UI, move from the CLI, the row and page patch live under 100 ms; approve with `a`; a 412 on a stale description shows the conflict UI; Playwright create, approve, live, peek, paint specs pass; bundle within budget; design review approved.

**M3 Kanban, filters, Cmd-K, search, status settings.** Accept: drag writes activity and the board patches; Cmd-K resolves `cde-1` and a typo; filters round-trip through the URL and "Copy as CLI"; a sub-project customizes its statuses and its tickets remap; Playwright kanban and filter specs pass.

**M4 PRs and CI.** Batched GraphQL poller, rate-limit accountant, auto-link, PR rows with ribbon, per-check rows, diff via `@pierre/diffs`, CI badge on rows and cards, Failing CI inbox section, gh banner. Accept: `trellis pr add CDE-1 <real PR>` shows checks within a minute; a push flips the ribbon pending → pass live; `gh auth logout` shows the banner with one log line; a branch `cde-2-foo` links itself; the stub counts one gh spawn per tick for 40 PRs.

**M5 Attachments, install, backup, docs.** Upload (drop, paste, CLI), serving with the inline allowlist, blob GC and boot sweep, `install`/`uninstall`/`backup`/`restore`/`export`/`logs`, launchd plist, gateway line, README with hero gif, CONTRIBUTING, templates, changesets. Accept: `trellis install` from a fresh shell leaves `http://trellis.localhost` serving after a reboot; an uploaded SVG downloads instead of rendering; backup then restore reproduces the data; the README steps work on a second machine.

**M6 Mobile.** Expo app per the mobile section, QR pairing. Accept: a comment from the phone appears on the web live; a `trellis move` shows on the phone within a second; approve by swipe; scroll budget recorded in the review verdict.

**M7 (after v1).** `trellis mcp`, thumbnails, Range requests, import, single binary (`bun build --compile` with embedded migrations, PGlite wasm, web dist), per-column virtualization, diff highlighting in a worker.

## Verification

- Unit and contract tests per workspace against a fresh in-memory PGlite per file; gh stubbed at the process boundary; CLI smoke against a spawned server; `assertStatusInvariant(tx)` at the end of every service test.
- Perf suite: 10k seed in `check`, 50k in `perf`, `Server-Timing` headers, size budget script, all with the targets above.
- E2E: Playwright with a temp `TRELLIS_HOME`, including the live-update latency probe.
- Design: screenshots from the running app in both themes at desktop and phone widths, graded by the rubric, attached to every UI verdict.
- Live use: after M2, Navid's own work runs through trellis; `0x962/trellis` is declared as the repo of project `TRL` and every later milestone is dogfooded on real tickets and real PRs.

## Open items for Navid

- Sol: my agent tool selects `opus` and `fable` only. If Sol is reachable another way, say how.
- trellis never edits the source of another repo. The gateway route lives in the shared file `~/.config/localhost-gateway/routes.json`, and `trellis install` changes only its `trellis` key.
- Superset (CDE): the upstream merge in worktree `meadow-mass` is committed (`92e1e27f0`); lint fixes and the `golemapp-migration.ts` biome-ignore are uncommitted; tests not run. Parked until you say otherwise.
