I have what I need from the plan; the brief says not to read other files, so here is the analysis.

## 1. Performance requirements

Budgets are for Navid's Mac (Apple Silicon) against a seeded DB. CI enforces the same tests at 2.5x the budget as a regression guard. The seed (`apps/server/test/perf/seed.ts`) is deterministic: N tickets across 3 roots x 8 projects, 10 activity rows and 2 comments per ticket, 2 KB average description, 40 open PRs. The 10k seed runs in `bun run check`; the 50k seed runs from a cached data dir (`~/.cache/trellis/perf-50k`, CI cache keyed by seed version) via `bun run perf`.

| # | Metric | Target | How measured | Enforcing test |
|---|---|---|---|---|
| 1 | Cold boot to first request | `/api/health` = 200 (after migrations, `ANALYZE`, ready) <= 1.5 s warm data dir; <= 3.5 s first run (initdb + `pg_trgm`) | Spawn server, poll health with 10 ms interval, wall clock | `apps/server/test/perf/boot.perf.ts` |
| 2 | `tickets.list` p95 (default table query: 5-project subtree, status filter, active only, sort priority desc, updated desc, limit 50, no total) | 1k: 5 ms; 10k: 10 ms; 50k: 20 ms. With `filter.q` (FTS, no trigram) at 50k: 40 ms | `Server-Timing: db;dur=` header, 200 runs, p95 | `apps/server/test/perf/list.test.ts` |
| 2b | `tickets.board` (all active columns, <= 100 cards per column) and `tickets.counts` (per-status counts, same filters) at 50k | 30 ms each | same | same file |
| 3 | `search.query` p95 at 50k | 40 ms (websearch + trigram, limit 20); `KEY-n` path 3 ms | same | `apps/server/test/perf/search.test.ts` |
| 4 | SSE event to repaint | Patch path (row already in cache) <= 100 ms; invalidation path <= 500 ms; both measured commit-to-DOM | Event carries server `ts`; Playwright page `MutationObserver` records `Date.now()` at row change (same machine, no skew) | `apps/web/e2e/live.spec.ts` |
| 5 | Kanban drag-to-drop | Optimistic reorder painted within 1 frame (16 ms) of drop; `tickets.move` server p95 <= 20 ms; rollback path exercised | Playwright drag + `Server-Timing`; a stub 409 forces rollback | `apps/web/e2e/kanban.spec.ts` |
| 6 | Ticket open | Peek from cache: summary fields <= 50 ms, full body <= 100 ms; cold: <= 250 ms to full content; `j`/`k` step <= 50 ms | Playwright `performance.now()` between keypress and `[data-loaded]` | `apps/web/e2e/peek.spec.ts` |
| 7 | Web bundle | Initial route JS (shell + table) <= 220 KB gz; Tiptap chunk <= 200 KB gz lazy; diff chunk <= 350 KB gz lazy; total <= 900 KB gz; fonts <= 160 KB (2 latin files) | `vite build` manifest sizes | `apps/web/scripts/size-budget.ts` run in `check` |
| 7b | First paint | FCP <= 300 ms; list rows painted <= 600 ms cold (empty HTTP cache), <= 150 ms warm | Playwright `performance.getEntriesByType('paint')` | `apps/web/e2e/paint.spec.ts` |
| 8 | Server memory at 50k | RSS <= 350 MB idle; <= 550 MB peak during backup or a 50 MB upload | `rss` in `/api/health` | `apps/server/test/perf/memory.perf.ts` |
| 9 | Poller cost per tick | <= 1 `gh` process per 50 due PRs plus 1 per declared repo per auto-link tick; <= 250 ms CPU per tick; <= 1,200 GitHub requests/hour with 20 pending PRs; interactive `gh pr diff` <= 2 s | Stub `gh` counts spawns and records args; `process.cpuUsage()` around `tick()` | `apps/server/test/gh/poller.perf.test.ts` |
| 10 | Attachment upload | 50 MB <= 1.0 s end to end (>= 50 MB/s); event-loop stall during upload <= 50 ms; serve 50 MB <= 300 ms | `fetch` timing; a 10 ms `setInterval` drift probe in the server test process | `apps/server/test/perf/attachments.test.ts` |
| 11 | CLI cold start | `trellis --help` <= 60 ms; `trellis list --json` <= 150 ms wall p95 including the round trip (built bundle); <= 300 ms from source | 20 spawns, p95 | `packages/cli/test/coldStart.perf.ts` |
| 12 | Mobile list scroll | 500-row list >= 55 fps on iPhone 12 / Pixel 5 class; cold open with persisted cache <= 1.5 s to first rows; SSE reconnect on foreground <= 1 s | Manual, Expo perf monitor, recorded in the M6 review verdict | Design constraints enforced by review (FlashList, fixed heights, summaries only); no automated gate in v1 |
| 13 | Log growth | <= 60 MB total on disk, ever | Rotating sink 10 MB x 5 files; GET requests not logged at `info` | `apps/server/test/log.test.ts` (rotation at size) |
| 14 | Backup at 50k | Hold (no queries served) <= 1.5 s; archive <= 150 MB; total <= 15 s | Timed `POST /api/backup` on the 50k seed | `apps/server/test/perf/backup.test.ts` |
| 15 | Boot migrations | <= 100 ms when nothing to apply; each new migration logs its duration | Timer around migrator | part of `boot.perf.ts` |
| 16 | Mutation p95 (`tickets.update`, `create`, `move`, `comments.create`) under 5 concurrent agents | <= 15 ms server time each; 20 writes/s sustained with list p95 still under target 2 | Parallel `fetch` loop against the seeded server | `apps/server/test/perf/concurrency.test.ts` |

## 2. Problems, ranked

### Blockers

**B1. Kanban `limit 500` silently drops cards.**
Mechanism: `tickets.list` with `sort position, limit 500, completedAfter 30d` returns the first 500 rows across all statuses. Columns beyond that cut-off are missing cards with no indicator. At 50k tickets with a busy root, active plus recently completed exceeds 500 easily. It is a correctness bug dressed as pagination, and keyset cursors do not help since the board wants every column's head.
Fix: add `tickets.board {project, includeSubprojects, filter}` returning `{columns: [{statusId, count, items: TicketSummary[] (first 100 by position, id)}]}` in one query (`row_number() over (partition by status_id order by position, id) <= 100` plus a grouped count). "Show 50 more" per column calls `tickets.list` with `filter.status = [id]`, keyset on `(position, id)`. Remove the `limit 500` contract for the board.

**B2. `total` on every list call is a 50k-row scan every SSE tick.**
Mechanism: a `count(*)` with the same filters must visit every matching row. PGlite has no background vacuum (single process, no bgworkers), so the visibility map is never set and index-only scans never happen: every count is index-then-heap, 15 to 40 ms at 50k in WASM. That runs on every list refetch, including each SSE-driven refetch, on the one connection.
Fix: remove `total` from `tickets.list`; return `{items, nextCursor}`. Add `tickets.counts {filters}` returning `{total, byStatus}` (one `GROUP BY status_id`), fetched by the table for group headers, `staleTime` 5 s, invalidated only on membership-changing events with the debounce in B3.

**B3. Invalidation storm from agent writes.**
Mechanism: 200 CLI writes per minute is 3.3 events/s. Each `ticket.updated` invalidates `tickets.list` (every instance), `tickets.get`, `inbox.get`, `activity.list`. Each invalidation refetches every active query: a table of ~2k summary rows (600 KB), counts, the four inbox queries, the peek's four queries. That is 8 to 10 queries per event, 25 to 35 queries/s, 250 to 700 ms of PGlite time per second, plus ~2 MB/s JSON on the main thread, plus a full table re-render every 300 ms. Three web tabs plus mobile multiply it. Bursts of 20 writes/s (a bulk edit) saturate the single connection; agent requests queue behind the refetch traffic caused by their own writes.
Fix (four decisions):
1. `ticket.created|updated` events carry the full `TicketSummary` row (~300 B) plus `version` (see H2). `invalidateFor` applies `setQueryData` patches to every cached list and detail containing that id, immediately. No refetch.
2. Invalidations happen only when membership or order can change (status, project, priority, parent, completed_at, create, delete) and go through a client-side coalescer: 250 ms trailing debounce, 1 s max wait, deduped by query key.
3. `inbox.get` invalidation debounced 1 s. `refetchOnWindowFocus: false`, `staleTime: Infinity` for SSE-patched entities; `reset` and reconnect invalidate all.
4. Mutations do not `invalidateQueries` in `onSettled`; they `setQueryData` from the response. Invalidate on error only.

**B4. Poller cannot keep up and exceeds GitHub rate limits.**
Mechanism: `gh` startup is ~150 ms plus a 200 to 500 ms API round trip, so each PR costs two processes and ~1.2 s of slot time. Three slots give ~2.5 PRs/s. 100 pending PRs at a 20 s cadence need 10 calls/s: the semaphore saturates, cadence degrades to ~45 s, and ~60% of a core goes to Go process startup. Rate limit: 20 pending PRs x 2 calls x 180 ticks/hour = 7,200 requests/hour against a 5,000/hour limit; 100 PRs is 36,000. `gh` hides the 403 until everything fails.
Fix: replace `gh pr view` + `gh pr checks` with one `gh api graphql` request per 50 PRs using aliased `repository(owner, name) { pullRequest(number) { ... commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { nodes { ... on CheckRun { name status conclusion detailsUrl checkSuite { workflowRun { workflow { name } } } } ... on StatusContext { context state targetUrl } } } } } } } } }`. One process per tick regardless of PR count, one rate-limit point. Cadence: pending 30 s, open-not-pending 120 s, recently merged/closed 10 min. `gh api rate_limit` every 5 min; below 20% remaining, multiply intervals by 4 and emit `gh.status`. Slots: 2 poller, 1 reserved interactive (diff, refresh, link). `link` uses the same GraphQL path with one PR. Write rows only when the content hash changes; `fetched_at` stays in memory.

**B5. `tickets.list` returns `description`.**
Mechanism: list rows include the markdown body. At 2 KB average, a 500-row page is 1 MB of JSON, serialized on the server, structured-cloned, parsed, and validated by Zod on the client, on every page and every refetch. The kanban and table never render it.
Fix: `TicketSummary` (id, identifier, title, priority, statusId, projectId, parentId, position, version, subCount, subDone, commentCount, attachmentCount, pr {state, ciState, summary}, lastActor, updatedAt, createdAt, completedAt) for `list`, `board`, events. `tickets.get` returns the full ticket. CLI `list` prints summaries; `show` prints the body.

**B6. Grouped table over paginated data is inconsistent.**
Mechanism: the table groups by status client-side but the server sorts by priority, updated. Page 1 gives 50 rows scattered across groups; groups fill in as pages load and rows jump between renders. A keyset cursor over `(status position, priority, updated_at, id)` has no index because status position lives in another table.
Fix: two tiers. Active tickets (category not done/canceled) are fetched fully in one call, `limit 2000` with summaries (600 KB, ~10 ms at PGlite); grouping and sorting happen client-side, which is trivial at that size. Done and Canceled groups are collapsed by default and fetched on expand with keyset `(completed_at desc, id)`, 100 per page, per group. Counts from `tickets.counts`. Above 2000 active tickets the UI shows a banner "showing the 2000 most recently updated; filter to narrow".

### High

**H1. PGlite on the main thread: every query stalls HTTP, SSE, gh stdout, and uploads.**
Mechanism: PGlite executes WASM synchronously on the calling thread; `await db.query()` yields only between wire-protocol chunks. A 40 ms search, a 1 s backup hold, or a bad plan freezes SSE writes, request parsing, and child-process pipe draining. The single connection means requests queue anyway, but the queue is inside PGlite with no priority, so a Cmd-K keystroke burst delays an agent's write.
Fix: run Drizzle plus the service layer in a Bun `Worker` (`apps/server/src/db/worker.ts`); the main thread hosts Hono, SSE, the gh poller, and file I/O, and calls services over `postMessage` as `{proc, input, actor}` with results structured-cloned (600 KB in ~2 ms). Do not use `@electric-sql/pglite/worker`: it depends on `navigator.locks` for leader election, which Bun lacks. The worker owns a priority queue: mutations before reads, search lowest, with search requests keyed by client id so a newer query drops a superseded one before it runs. The service interface has two transports, `inline` (tests, `TRELLIS_DB_INLINE=1`) and `worker` (production), so per-file in-memory PGlite tests stay as planned.

**H2. Optimistic updates reconciled by `updatedAt` are lossy.**
Mechanism: Postgres `now()` has microsecond resolution but the JSON serialization and JS `Date` truncate to milliseconds; a bulk agent edit produces two updates of one ticket inside 1 ms with equal `updatedAt`, and the compare direction decides whether the newer patch is dropped. Independently, the mutation HTTP response and the SSE patch for the same commit arrive in either order.
Fix: `tickets.version integer not null default 1`, incremented by the service on every write (including comment, attachment, and PR writes, which also bump `updated_at`). Summaries, events, and mutation responses carry it. Client rule: apply an incoming row iff `incoming.version > cached.version`; while a mutation is in flight for a ticket, queue SSE patches for that id and apply the highest version after settle. Event ids come from a monotonic ULID factory so `Last-Event-ID` ordering is exact within one millisecond.

**H3. No vacuum, no stats: plans and bloat degrade over weeks.**
Mechanism: PGlite runs no autovacuum. Every update on `tickets` is non-HOT because `updated_at` is indexed, so each write inserts into all eight indexes (two GIN) and leaves a dead tuple. 200 updates/min is 288k dead tuples/day; the table bloats and every scan slows. Without `ANALYZE` after a restore or import, the planner uses default estimates and picks seq scans, blowing target 2 at 50k.
Fix: `ANALYZE` after migrations at boot and after `restore`, import, and the perf seed. `VACUUM (ANALYZE) tickets, activity, comments` every 10 minutes when more than 1,000 writes have occurred since the last run, and after backup. Log duration. Index set on tickets, cut to what the query shapes use: PK, `UNIQUE (root_id, number)`, `(project_id, status_id, position)`, `(parent_id)`, partial `(root_id, updated_at desc) WHERE completed_at IS NULL`, partial `(root_id, completed_at desc) WHERE completed_at IS NOT NULL`, GIN `search`, GIN trgm `title`. Drop `(status_id, position)` and the global `(updated_at desc)`.

**H4. Search shape in PGlite.**
Mechanism: `title % q` with trigram threshold 0.25 on a 2-character query makes the GIN index useless and computes similarity for most of 50k rows (100+ ms in WASM). `websearch_to_tsquery` gives no prefix match, so typing "auth" misses "authentication" until the word is complete. The 80 ms Cmd-K debounce fires up to 10 queries for a 10-character word, each queued on the single connection behind agent writes.
Fix: `KEY-n` regex short-circuit; FTS uses `websearch_to_tsquery` plus a `:*` prefix on the last token; trigram only when `q.length >= 3`, `LIMIT 20` each, merged in JS; `SET LOCAL statement_timeout = 200` for search only. Client: 120 ms debounce, one in-flight search, drop superseded (H1's queue does the same server-side). `filter.q` in `tickets.list` uses FTS only, never trigram.

**H5. Tiptap mounted per peek.**
Mechanism: `j`/`k` walks the list with the peek open; mounting a Tiptap editor per ticket costs 30 to 50 ms (ProseMirror schema, extensions, markdown parse) plus a 150 to 200 KB chunk on first use, so the walk is visibly jerky and the 50 ms per-step budget fails.
Fix: render the description read-only as HTML from markdown (a 10 KB renderer, no editor) and mount Tiptap on click or `e`; preload the Tiptap chunk on idle after the shell paints; keep one editor instance alive and swap its content when the user edits consecutive tickets.

**H6. `@pierre/diffs` on a 3k-line diff.**
Mechanism: parse plus syntax highlighting of 3k lines is 200 to 800 ms on the main thread, and the DOM is 3k to 6k rows, all inside a ticket page that also holds a timeline. `gh pr diff` output is unbounded (a lockfile change is 20k lines).
Fix: files collapsed by default beyond the first 10, each file rendered on expand inside `startTransition`; unified view; highlighting off above 1,500 changed lines in a file; server caps `gh pr diff` at 1 MB and returns `{truncated: true, url}` beyond; the diff chunk lazy-loads on first expand; measure the chunk, and if `@pierre/diffs` pulls shiki past 350 KB gz, use the JavaScript regex engine with the repo's top languages only.

### Medium

**M1. CLI imports the whole contract.**
Mechanism: `packages/api` exports TS source, so every CLI run transpiles ~100 files and builds ~60 Zod 4 schemas at import (30 to 80 ms) before the request. `RPCLink` needs no runtime contract.
Fix: the CLI uses `RPCLink` with `import type` for the contract (zero Zod at runtime); citty lazy `subCommands` (`list: () => import('./commands/list')`); `trellis install` runs `bun build --target=bun` into one file; `list --json` streams a JSON array page by page (500 per request) and `--jsonl` emits one object per line; default limit 50, `--all` for everything, summaries only.

**M2. Subtree resolution and status lookups as SQL per request.**
Mechanism: the recursive CTE over projects is cheap (< 1 ms, tens of rows), but joining it into the ticket query gives the planner no row estimate and invites a seq scan.
Fix: an in-memory project tree and effective-status cache in the DB worker, rebuilt on `project.*` and `statuses.changed`; services resolve the subtree to an id array and query `project_id = ANY($1)`. No `ltree` or `path` column; `CDE/web/auth` path refs resolve from the same cache.

**M3. Ticket page fan-out.**
Mechanism: get, comments, activity, PRs, attachments as five round trips, five queue positions.
Fix: `tickets.get` returns ticket, sub-tickets, PRs, attachments; `timeline.list {ticket, before?, limit 100}` merges comments and activity newest-first (activity keyed by ULID range, which is time-ordered and indexed on `(ticket_id, id)`); the web sends both through oRPC's batch link in one request.

**M4. Inbox and activity queries without matching indexes.**
Mechanism: `stalled` (started, no activity 24 h) implies `max(activity.created_at) per ticket`; `doneByAgentsToday` filters activity by `created_at` which has no index.
Fix: comments, attachments, and PR changes bump `tickets.updated_at`, so `stalled` is `status_id = ANY(startedIds) AND updated_at < now() - 24h` on the partial active index; activity date ranges use `id >= ulidAt(startOfDay)` on `(project_id, id)`.

**M5. Output validation and date serialization cost on 2k-row lists.**
Mechanism: oRPC validates `.output()` schemas; 2k rows x 20 fields through Zod 4 is 10 to 20 ms; `z.date()` makes the RPC serializer tag each of three dates per row.
Fix: dates are ISO strings in the contract (`z.iso.datetime()`); measure output validation in M1, and if the list spends more than 5 ms in Zod, the server implements list procedures from a sibling contract with a passthrough output while OpenAPI is generated from the full contract.

**M6. Kanban and table re-render scope.**
Mechanism: pragmatic-drag-and-drop `monitorForElements` on the board fires on every pointer move; a state update at board level re-renders 500 cards per frame. TanStack Table recomputes group and expanded row models when `data` identity changes, on every patch.
Fix: drop-indicator state lives in the target card and column only; cards and rows are `React.memo` with stable handlers via a context of callbacks; list patches produce structurally shared arrays so unchanged row objects keep identity; per-column cap of 100 rendered cards with "show more"; fixed `estimateSize`, no measurement; group headers via a "current group" overlay computed from `virtualItems[0]` (sticky positioning inside a virtualizer is unreliable).

**M7. Bundle and motion.**
Mechanism: full `motion` is ~35 KB gz for animations that are all opacity and translate at 120 to 240 ms; Base UI without per-component imports drags unused components; the contract's Zod ships to the web for oRPC.
Fix: `motion/mini` and CSS transitions only, enforced by a Biome `noRestrictedImports` rule; TanStack Router `autoCodeSplitting`; lazy chunks for Tiptap, diffs, and the board route; Zod stays (needed by the RPC client for typed errors) but `packages/api` must be side-effect free so tree shaking works.

**M8. Fonts and theme.**
Mechanism: a woff2 fetched after CSS parses gives a fallback-font first paint on first load; without size metrics it also shifts layout. Theme read after hydration flashes light.
Fix: `<link rel="preload" as="font">` for `inter-latin-wght-normal.woff2` and the JetBrains Mono latin file, `font-display: swap`, a `size-adjust`/`ascent-override` fallback face, served `immutable`; an inline `<head>` script sets `data-theme` from localStorage before first paint plus `color-scheme`.

**M9. Attachments: streaming claim versus `z.file()`.**
Mechanism: oRPC `z.file()` hands the handler a complete `File`; Bun buffers the multipart body in memory. "Stream to tmp while hashing" is not what happens. At a 50 MB cap that is acceptable memory-wise, but hashing 50 MB in one synchronous call stalls the loop ~40 ms and a naive `arrayBuffer()` doubles memory.
Fix: keep `z.file()`; hash with `Bun.CryptoHasher` over `file.stream()` in 1 MB chunks (yields between chunks), write the tmp file from the same stream, rename; DB row via the worker. Serve with `Bun.file` (sendfile). Range requests stay in M7.

**M10. Mobile list and cache.**
Mechanism: FlatList with variable-height cards drops frames past ~300 rows on mid-range phones; AsyncStorage on Android fails silently past ~6 MB; a 5 MB photo decoded full-size for a thumbnail costs ~50 MB RAM; a 15 s SSE ping wakes the cellular radio four times a minute.
Fix: `@shopify/flash-list` v2 with fixed-height rows and summaries; `react-native-mmkv` persister capped at 5 MB, `maxAge` 24 h; `expo-image` with `contentFit` and inline previews only under 3 MB until server thumbnails exist (M7); SSE ping 25 s, SSE only in foreground, and on foreground invalidate all instead of replaying the ring buffer.

**M11. Backups and export in WASM memory.**
Mechanism: PGlite `dumpDataDir()` builds the archive inside the WASM heap; the data dir at 50k tickets is ~300 MB (tickets, tsvectors, two GIN indexes, ~500k activity rows), so a backup spikes RSS past target 8. A JSON `/api/export` built with `JSON.stringify` is the same problem.
Fix: backup = worker pauses the queue, runs `CHECKPOINT`, main spawns `tar -cf` of the data dir (~1 s), worker resumes, `gzip` runs after release. Export streams NDJSON per table through a `ReadableStream`, 1,000-row keyset pages.

**M12. Logs.**
Mechanism: launchd `StandardOutPath` never rotates; one line per request at agent traffic is 5 to 40 MB/day, gigabytes per year.
Fix: the server owns a rotating sink (10 MB x 5) in `server.log`; launchd stdout goes to `launchd.log` for crashes only; mutations and errors at `info`, GETs at `debug` (off by default); the poller logs only on change or status flip.

### Low

**L1. `actors` upsert on every mutation.** One extra statement per write. Cache in the worker, flush `last_seen_at` every 30 s.
**L2. Ring buffer scan.** `since(id)` over 1,000 entries is a linear scan; fine. Keep it; add binary search only if the buffer grows.
**L3. Position renumbering.** Halving from 1,024 hits 1e-6 after ~30 drops in one slot; renumber the column with one `UPDATE ... FROM (VALUES ...)`. Fine as designed.
**L4. Project delete cascade at scale.** Deleting a root with 50k tickets is a multi-second transaction. Rare; log it, accept.

## 3. Design changes

Make now (M1 unless noted):
- Add `tickets.board`; remove `limit 500` as the board mechanism.
- Remove `total` from `tickets.list`; add `tickets.counts`.
- Define `TicketSummary`; `list`, `board`, and events carry it; `get` carries the body.
- Two-tier table loading: active in full (cap 2,000), done/canceled paginated per group on expand (M2).
- Events carry the summary row and `version`; client patches immediately, invalidates through a 250 ms coalescer; no `onSettled` invalidation (M2).
- Add `tickets.version`; drop `updatedAt` comparison; monotonic ULID event ids.
- DB worker with a priority queue and an inline transport for tests; no `@electric-sql/pglite/worker`.
- Poller on batched `gh api graphql`; cadences 30 s/120 s/10 min; rate-limit accountant; 2 + 1 slots (M4).
- `ANALYZE` at boot, restore, import, seed; periodic `VACUUM (ANALYZE)`; trimmed index set with two partial indexes.
- Search: `KEY-n` short-circuit, prefix FTS, trigram only at 3+ chars, 200 ms statement timeout, one in-flight client search.
- In-memory project tree and status cache in the worker; `project_id = ANY($1)`.
- `tickets.get` bundles related rows; `timeline.list` replaces separate comments and activity fetches on the ticket page; batch link (M2).
- Comments, attachments, and PR changes bump `tickets.updated_at` and `version`.
- Dates as ISO strings in the contract.
- CLI: `import type` contract with `RPCLink`, lazy subcommands, built bundle on install, streamed `--json`, `--jsonl`.
- Backup via `CHECKPOINT` + spawned `tar`; export as streamed NDJSON (M5).
- Rotating log sink; GETs at `debug` (M1).
- Web: read-only markdown render in the peek, Tiptap on edit, idle preload (M2); `motion/mini` only with a Biome rule; font preload with a metric-matched fallback; pre-paint theme script (M0/M2).
- Diff: collapsed files, per-file lazy render, 1 MB server cap, highlight cutoff (M4).
- Mobile: FlashList v2, MMKV persister, 25 s ping, foreground invalidate (M6).
- Perf suite: seed script, 10k in `check`, cached 50k on `bun run perf`, `Server-Timing` header, bundle size budget script (M1/M2).

Defer (M7 or later):
- Server thumbnails and Range requests (already M7).
- Per-column kanban virtualization above 100 cards.
- Diff highlighting in a Web Worker.
- Output-validation bypass for list procedures, only if the M1 measurement exceeds 5 ms.
- Actor upsert batching.
- Activity retention or archiving.
- Automated mobile scroll benchmark.

### Critical Files for Implementation

- /Users/navidkhan/.claude-work2/plans/delightful-booping-key.md (the plan to amend: contract table, schema indexes, live-updates section, poller section, verification section)
- /Users/navidkhan/projects/trellis/packages/api/src/contract/tickets.ts (planned: `TicketSummary`, `tickets.board`, `tickets.counts`, `version`, `total` removal, ISO dates)
- /Users/navidkhan/projects/trellis/apps/server/src/db/worker.ts (planned: Bun Worker hosting PGlite + Drizzle + services, priority queue, inline transport for tests)
- /Users/navidkhan/projects/trellis/packages/api/src/query-keys.ts (planned: `invalidateFor` with patch-first application, version guard, and the 250 ms coalescer)
- /Users/navidkhan/projects/trellis/apps/server/src/gh/poller.ts (planned: batched GraphQL fetch, cadences, rate-limit accountant, slot split)