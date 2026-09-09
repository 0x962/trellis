# Adversarial critique: trellis schema and data rules

Scope: "Domain rules", "Database schema", and the API/poller write paths in `/Users/navidkhan/.claude-work2/plans/delightful-booping-key.md`.

## Ranked findings

### Blockers

**1. Any `db.*` call inside `withTx` deadlocks the whole server**
- Failure: PGlite serializes every query on one instance mutex; `transaction(cb)` holds it for the callback's duration. `tickets.create` opens `db.transaction`, then a helper written as `effectiveStatuses(projectId)` that imports the module-level `db` runs `db.select(...)`. That select waits for the mutex the transaction holds. The transaction waits for the select. One HTTP request hangs the process forever; every later request queues behind it. No error, no timeout, no log line.
- Fix: no module-level `db` outside `apps/server/src/db/client.ts` and `db/tx.ts`. Every query function and service takes `tx: Tx` as its first argument. A Biome `noRestrictedImports` rule bans `db/client` everywhere else. One test runs a nested query inside `withTx` with a 2 s timeout to prove the rule holds.

**2. `tickets.root_id` and `projects.root_id` are unenforced denormalizations**
- Failure: `tickets.update({project})` checks `CROSS_ROOT_MOVE` in code, then writes `project_id` only. A later refactor writes `project_id` from a resolved ref and forgets `root_id` (there is no constraint to stop it). The ticket now has `root_id = CDE` but sits in project `TRL/web`. `TRL-7` resolves to nothing, `UNIQUE (root_id, number)` guards the wrong root, and the next `CDE` create can collide. Same for sub-projects: nothing stops `INSERT projects (parent_id = CDE/web, root_id = TRL)`. "Immutable" on `root_id` is a comment, not a rule.
- Fix: make the database prove it. `projects`: `UNIQUE (id, root_id)`; composite `FK (parent_id, root_id) REFERENCES projects (id, root_id)`; `CHECK ((parent_id IS NULL) = (root_id = id))`; `CHECK ((parent_id IS NULL) = (key IS NOT NULL))`; `CHECK (parent_id <> id)`. `tickets`: `UNIQUE (id, root_id)`; `FK (project_id, root_id) REFERENCES projects (id, root_id)`; `FK (parent_id, root_id) REFERENCES tickets (id, root_id)`. With MATCH SIMPLE a null `parent_id` skips the check, so roots and top-level tickets pass. A root row inserts with `root_id = id` in one statement (FK checks run at statement end). Now a wrong `root_id` is a constraint violation, and `root_id` cannot change without violating the CHECK or the FK. No trigger needed.

**3. The status invariant is stated for one case and violated in four others**
- Invariant to enforce: `tickets.status_id` references a status owned by the ticket's *status owner*, the nearest ancestor-or-self project that owns statuses. Define *status scope(P)* = P plus every descendant reachable without crossing a project that owns statuses.
- Failures:
  - a. Project move: ticket in `CDE/web` (own set) moved to `CDE/api` (inherits root). `status_id` still points at `web.In Progress`. The `CDE/api` board groups by the root's set; the ticket is in no column. `STATUS_NOT_IN_PROJECT` is silently violated.
  - b. `statuses.clear(web)` remaps "its tickets" and deletes `web`'s statuses. `CDE/web/auth` inherits from `web`; its tickets still point at `web.*`. `tickets.status_id` is RESTRICT, so the transaction fails with a raw FK error. Same for "creating the first status" on a sub-project: only its own tickets are remapped, the inheriting descendants keep the ancestor's ids and now render outside the new set.
  - c. Re-parent `CDE/web/auth` (no own set) under `CDE/api`: its status owner changes from `web` to `CDE`; nothing remaps.
  - d. `statuses.delete(id, moveTicketsTo)` accepts any status ULID. Pass one from another project; every ticket lands outside its effective set.
- Fix: one function `remapScope(tx, projectId, toOwnerId)` used by clear, first-create, re-parent, and project move. Match order: (name AND category) → lowest-position status of the same category → the target owner's `is_default` status. One `batch_id`, one activity row per remapped ticket (`action = 'status.remapped'`, `actor = system:trellis`). `statuses.delete` requires `moveTicketsTo.project_id = status.project_id` else `STATUS_NOT_IN_PROJECT`. A test helper `assertStatusInvariant(tx)` runs one SQL query over the whole DB and is called at the end of every service test.

**4. `parent_id` cycles are not prevented (tickets and projects)**
- Failure: `A.parent = B`, then `tickets.update(B, {parent: A})`. Both writes pass every constraint. The sub-ticket progress CTE and the breadcrumb CTE recurse forever; the request never returns; under blocker 1's mutex the server is dead. `parent_id = id` is a one-write version of the same thing.
- Fix: `CHECK (parent_id <> id)` on both tables. `tickets.update({parent})` and `projects.update({parent})` walk up from the new parent with a recursive CTE (`UNION`, `depth < 64`) and raise `PARENT_CYCLE` (409, add to the contract) if the row itself appears. Serialization by the mutex makes this race-free.

**5. `UNIQUE (ticket_id, owner, repo, number)` duplicates the PR row per ticket**
- Failure: the auto-linker finds `CDE-12` and `CDE-13` in one PR body and inserts two rows for the same PR. The poller fetches it twice per tick (double `gh` calls, semaphore pressure); one fetch errors, the other succeeds; the two rows disagree on `ci_state`; the two ticket pages show different ribbons for the same PR.
- Fix: normalize. `pull_requests` holds the PR once, `UNIQUE (owner, repo, number)`; `ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at) PK (ticket_id, pull_request_id)` holds links. `ALREADY_LINKED` = PK violation on the link table. Delete a PR row when its last link goes, inside the same transaction (`DELETE FROM pull_requests p WHERE NOT EXISTS (SELECT 1 FROM ticket_pull_requests l WHERE l.pull_request_id = p.id)` at the end of unlink and ticket delete). Linking one PR to two tickets stays allowed and is now one poll. Poller activity: one row per linked ticket, same `batch_id`.

**6. `activity.id` (ULID) as the cursor breaks under a clock step, and `from_value/to_value` as full text explodes on autosave**
- Failure A: laptop sleeps, NTP steps the clock back 3 s, the server restarts (the `ulid` monotonic factory only protects inside one process). New rows get ids that sort before the last row the client saw. `activity.list` with cursor `id > X` never returns them; SSE `since(id)` skips them; the timeline shows them under yesterday.
- Failure B: description autosave every 800 ms writes one row with the full old and new markdown. Twenty minutes of editing a 30 KB description = 1500 rows x 60 KB = 90 MB in a table the ticket page reads in full. PGlite runs in wasm memory; the ticket page query balloons; the "one interleaved timeline" fetch takes seconds.
- Fix: `activity.id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY`. It is the cursor, the sort key, and the SSE event id for activity-backed events. `batch_id` stays a ULID. `CHECK (field <> 'description' OR (from_value IS NULL AND to_value IS NULL))`: description rows record that it changed and `meta.deltaChars`; the service skips a new description row when the previous one for the same ticket and actor is younger than 5 min. Status rows store display text in `from_value/to_value` and `{fromId, toId, fromCategory, toCategory}` in `meta`, so the inbox and "done by agents" queries filter on `meta->>'toCategory'` without a join on a status that may be deleted.

**7. Attachment blob lifecycle loses files or leaves dangling rows**
- Failure A (race): T1 deletes the last row for sha S and commits, then unlinks after commit. Between the commit and the unlink, T2 uploads the same content: sees the final path exists, discards its tmp, inserts a row, commits. T1's unlink runs. T2's row points at a file that is gone. Single process does not save you; these are two interleaved async requests.
- Failure B (cascade): `tickets.delete` cascades `attachments` rows in the DB. The app never sees which shas were removed. Blobs stay forever. Same on `projects.delete --force`.
- Failure C (crash): crash after commit and before unlink, or after the tmp-to-final rename and before the row insert. Orphan files either way.
- Fix: one in-process async mutex `blobLock`. `finalize(sha)` (rename or dedupe, then insert) and `gc(sha)` (re-count rows, unlink if zero) both take it. Deleting services select the shas first, commit, then call `gc` for each. A boot sweep, before the server accepts requests, walks `attachments/` and unlinks every file with no row, and empties `attachments/tmp/`. Never sweep while serving (an in-flight upload has a file and no row). Drop `path`: it is a pure function of `sha256`, and two sources of truth is one too many. `sha256 text CHECK (sha256 ~ '^[0-9a-f]{64}$')`; `char(64)` has trailing-space comparison semantics nobody wants.

**8. `0000_extensions.sql` is invisible to the migrator, and `pg_trgm` is not loaded at construct time**
- Failure: a hand-written `drizzle/0000_extensions.sql` has no entry in `drizzle/meta/_journal.json`; `drizzle-orm/pglite/migrator` applies the journal, not the directory. Boot runs `0001_init.sql`, `CREATE INDEX ... gin_trgm_ops` fails with "operator class does not exist". Second trap: `CREATE EXTENSION pg_trgm` only works if the wasm module was passed to the constructor.
- Fix: create it with `drizzle-kit generate --custom --name extensions` (this writes the journal entry), then fill in the SQL. Construct with `new PGlite(dir, { extensions: { pg_trgm } })` from `@electric-sql/pglite/contrib/pg_trgm`. Set `pg_trgm.word_similarity_threshold` after `migrate()`, not inside a migration.

**9. Postgres enums plus a single-transaction migrator is a trap you will hit at the first schema change**
- Failure: M4 adds `review_state`; later someone adds a category value. drizzle-kit emits `ALTER TYPE status_category ADD VALUE 'blocked'`. The migrator runs every pending migration in one transaction; the next migration in the same batch that uses `'blocked'` (a default, a backfill) fails with "unsafe use of new value". Removing or reordering a value makes drizzle-kit emit drop-and-recreate, which fails on dependent columns.
- Fix: no `pgEnum`. Every enum-like column is `text({ enum: [...] })` plus a named `CHECK (col IN (...))`. drizzle-kit 0.31 diffs CHECK constraints as drop-and-add, fully transactional. Zod enums in `packages/api` stay the type source.

### Major

**10. The auto-link regex never matches the product's own branch names**
- Failure: the plan's branch template is `cde-42-slug` (lowercase). The regex `\b([A-Z][A-Z0-9]{1,9})-(\d+)\b` has no `i` flag. `gh pr list` returns `headRefName: "cde-2-foo"`; nothing links. The M4 acceptance passes only because it uses `CDE-2-foo`.
- Fix: match with `/\b([a-z][a-z0-9]{1,9})-(\d+)\b/gi`, uppercase the key before the lookup, and change the acceptance branch to `cde-2-foo`.

**11. Renaming a key rewrites every identifier; swapping keys corrupts history**
- Failure: rename `CDE` to `CODE`. Every `CDE-n` link, branch, PR body, and activity `to_value` text is now wrong; the auto-linker finds `CDE-42` and no root has that key. Swap two roots' keys via a temp key and every ticket in both roots silently changes identity.
- Fix: `key` is immutable once `ticket_counter > 0`: `KEY_LOCKED` 409. Before the first ticket, rename is free. No key history table in v1.

**12. `ticket_counter` on every project row is a loaded gun**
- Failure: a ref resolver returns a sub-project id; `UPDATE projects SET ticket_counter = ticket_counter + 1 WHERE id = $sub RETURNING` returns 1; the insert gets `(root_id = CDE, number = 1)`; UNIQUE collides (best case) or, on a fresh root, silently double-numbers.
- Fix: `CHECK (parent_id IS NULL OR ticket_counter = 0)`; the UPDATE adds `AND parent_id IS NULL`; the service throws if zero rows. Numbers are never reused (the counter only rises); deletes leave gaps; say so in the domain rules.

**13. `updated_at` semantics are undefined and `$onUpdate` fires where you do not want it**
- Failure: a drag that triggers a column renumber goes through `tx.update(tickets)` for 500 rows; Drizzle's `$onUpdate` bumps `updated_at` on all of them. The table's "updated" column, the `updatedAfter` filter, and "stalled" all lie. Also undefined: does a comment bump the ticket?
- Fix: `updated_at` = last change to a user-visible ticket field, a comment, or a PR link/unlink. Not: reorder, poller CI changes, status remaps. Renumber and remap use `tx.execute(sql\`UPDATE ...\`)` so `$onUpdate` cannot fire. App-side `$onUpdate` on every other table; no triggers.

**14. `started_at`/`completed_at` transitions are unspecified, and a category edit silently breaks them**
- Failure: done → started: `completed_at` stays set; the kanban's `completedAfter` filter keeps hiding an active ticket. `statuses.update({category: 'done'})` on a "QA" review status flips 40 tickets to done without touching `completed_at`.
- Fix: `started_at` = first time the ticket left `todo`, never cleared. `completed_at` = time it entered `done` or `canceled`, cleared when it leaves those. Applied by one `applyStatusTransition(ticket, fromCategory, toCategory)` used by move, `moveTicketsTo`, and remaps. `statuses.category` is immutable after creation (`STATUS_CATEGORY_IMMUTABLE` 409); create a new status and delete the old one with `moveTicketsTo`.

**15. The poller is an "agent", so every ticket with a PR was "touched by agents today"**
- Failure: `agent:trellis-poller` writes `pr.state_changed` rows on every CI flip. The "Touched by agents today" preset, the last-actor column, and the pulsing live dot light up on every ticket with an open PR.
- Fix: `actor_kind` gains `system`. The poller and internal batches (remaps, boot sweeps) write as `system:trellis`. The actor header rejects `system`. Agent presets filter `actor_kind = 'agent'`. The "last actor" lateral join excludes `system`.

**16. Search misses partial words, and the list query hauls the tsvector around**
- Failure: title "Refactor AuthService", query `servic`. FTS needs a whole token; `title % 'servic'` computes similarity against the whole 20-char title (about 0.23, under the 0.25 threshold). No hit. Separately, `tickets.list` with `select()` returns `description` and `search` for 500 rows.
- Fix: use `title <% q` ordered by `word_similarity(q, title)` (word-level, GIN-supported, `pg_trgm.word_similarity_threshold = 0.4` set at boot). FTS query = `websearch_to_tsquery('english', q) || to_tsquery('english', lastTerm || ':*')` for prefix on the last term. Keep `english` (stemming helps prose, harmless on identifiers). List queries select explicit columns; `description` and `search` come back only from `get`. Add `comments.search` as a generated column now (weight C, no trigger, no app code) and union it into search grouped by ticket; "not in v1" is a decision that costs more later than now.

**17. Project slug uniqueness is a no-op for roots, and `board` is a valid slug**
- Failure: `UNIQUE (parent_id, slug)` treats NULL `parent_id` as distinct; two roots can share a slug. Create sub-project `board` under `CDE`; `/p/CDE/board` is now both the root's kanban and the sub-project.
- Fix: `slug NOT NULL` on all projects (roots: `lower(key)`), `UNIQUE NULLS NOT DISTINCT (parent_id, slug)` (PG 15+, Drizzle `.nullsNotDistinct()`), `CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND slug NOT IN ('board', 'settings'))`.

**18. `activity.project_id` goes stale when a ticket moves, and the project feed has no cheap index**
- Failure: ticket moves `CDE/web` → `CDE/api`. Its earlier rows carry `project_id = web`. The `/p/CDE/api` feed misses its history; `/p/CDE/web` shows events for a ticket that is not there. The root feed (`/p/CDE`, the common case) is `project_id IN (subtree)` which is a bitmap OR plus sort every time.
- Fix: keep `project_id` as "project at the time" (audit semantics, and the trace for deleted tickets). Add `root_id` (immutable for tickets) with index `(root_id, id)`; the root feed is one backward index scan. Sub-project feeds join through `tickets.project_id` for ticket rows and use `project_id` for project-level rows.

**19. `ON DELETE` choices that fight the composite FKs and the app's own rules**
- `tickets.parent_id SET NULL` on a composite FK nulls `root_id` too. Fix: `RESTRICT`; `tickets.delete` runs `UPDATE tickets SET parent_id = NULL WHERE parent_id = $id` first (the plan already writes that activity row anyway).
- `projects.root_id` FK on a self-referencing root: use `NO ACTION` (checked at statement end) so the root row can delete itself after its subtree is gone. The composite FK on `projects` is also `NO ACTION`.
- `activity.project_id CASCADE` wipes the trace on project delete. Fix: the delete row is written on the parent project (`meta {deletedProjectId, key, name, ticketCount}`); a root delete leaves no row (the backup is the trace). Accepted.
- Attachments cascade: see blocker 7. PR links cascade: see blocker 5.

**20. `is_default` has no uniqueness, and "last status" rules differ by tree level**
- Failure: two defaults in one set; `tickets.create` without a status picks one at random. Delete the default status; the set has none; the next create fails.
- Fix: partial `UNIQUE (project_id) WHERE is_default`. Deleting the default transfers `is_default` to `moveTicketsTo`. A root's last status: `LAST_STATUS`. A sub-project's last status: also `LAST_STATUS`; the only way to zero is `statuses.clear`, which does the remap. Approve = lowest-position `done`; send back = lowest-position `started`; both are deterministic by `(category, position)`.

### Minor

**21. `pull_requests` details**
- Drop `checks_summary` (pure function of `checks`, computed on the client). `ci_state` is set by the poller with a pure `deriveCiState(checks)`: any `fail` or `cancel` → `fail`; else any `pending` → `pending`; else any `pass` → `pass`; else `none`. Unit-tested. `review_state` is an enum-like text: `none | review_required | approved | changes_requested`. `CHECK (jsonb_typeof(checks) = 'array')`. "Tickets with a failing check named X" is `checks @> '[{"name":"X","bucket":"fail"}]'`; no normalized `pr_checks` table in v1. `owner`/`repo` lowercased at the boundary with `CHECK (owner = lower(owner))` on both `repos` and `pull_requests`.

**22. `position` details**
- The `1e-6` threshold is absolute; double precision is relative. Renumber when `next - prev < 1` or when the midpoint equals a neighbor. Order and keyset by `(position, id)`. Moves are serialized by the mutex, so no concurrent-move problem exists; the only real hazard was `updated_at` (item 13). Renumber emits nothing extra: the moved ticket's `ticket.updated` invalidates the list. `statuses.position` is `integer`, rewritten 0..n-1 on every reorder.

**23. Missing columns, tables, and rules**
- `projects.ticket_template` ('' md): the plan's "per-project default description" has no column; `projects.description` is about the project.
- `settings (key PK, value jsonb, updated_at)`: the Start-with-agent template and the default actor name need a home the CLI and mobile can read.
- `branch_slug` is derived (`lower(KEY-n)` + slugified current title); drop the column.
- Archived projects: `PROJECT_ARCHIVED` 409 on ticket create or move-in; excluded from lists by default.
- Agents delete: enforce `AGENT_CANNOT_DELETE` (409, `force` bypass) on `tickets.delete`, same pattern as done. "Never delete" as an instruction does not bind curl.
- `actors`: `CHECK (length(name) BETWEEN 1 AND 64 AND name !~ ':')` (git user names contain spaces and capitals; keep them). Composite FK `(actor_name, actor_kind) → actors` from comments, attachments, links, activity; the upsert runs first in the same transaction.
- `wip_limit integer CHECK (wip_limit > 0)`; `title CHECK (length(btrim(title)) BETWEEN 1 AND 500)`; `number CHECK (number > 0)`; `size bigint CHECK (size > 0)`; `filename CHECK (position('/' in filename) = 0)`; `statuses.reviewer CHECK ((category = 'review') = (reviewer IS NOT NULL))`.
- Backup: `cp -r ~/.trellis/db` while the server runs is a torn copy. `trellis backup` calls `pglite.dumpDataDir()` through the server (`POST /api/backup` already exists) and writes the tarball to `backups/`.

## Corrected schema section (adopt verbatim)

Ids are ULIDs (`text`) except `activity.id`. Timestamps `timestamptz`, Drizzle `mode: 'date'`, `defaultNow()`, `$onUpdate` on `updated_at`. No `pgEnum`: enum-like columns are `text({ enum })` with a named `CHECK`. Closed sets: `priority` none | urgent | high | medium | low; `status_category` todo | started | review | done | canceled; `reviewer` agent | human; `actor_kind` human | agent | system; `pr_state` open | closed | merged; `review_state` none | review_required | approved | changes_requested; `ci_state` none | pending | pass | fail; `link_source` manual | auto.

| table | columns (constraints) |
|---|---|
| projects | id PK, parent_id (nullable), root_id NOT NULL, key (nullable, UNIQUE, CHECK `key ~ '^[A-Z][A-Z0-9]{1,9}$'`), slug NOT NULL (CHECK `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND slug NOT IN ('board','settings')`; roots use `lower(key)`), name (CHECK length 1..120), description ('' md), ticket_template ('' md), ticket_counter int NOT NULL DEFAULT 0, position int NOT NULL DEFAULT 0, archived_at (nullable), created_at, updated_at. UNIQUE (id, root_id). FK (parent_id, root_id) → projects (id, root_id) ON DELETE NO ACTION. UNIQUE NULLS NOT DISTINCT (parent_id, slug). CHECK `(parent_id IS NULL) = (root_id = id)`. CHECK `(parent_id IS NULL) = (key IS NOT NULL)`. CHECK `parent_id <> id`. CHECK `parent_id IS NULL OR ticket_counter = 0`. Index (root_id). |
| repos | id PK, project_id (FK CASCADE), owner (CHECK `owner = lower(owner)`), repo (CHECK `repo = lower(repo)`). UNIQUE (project_id, owner, repo). Effective repos = own + ancestors. |
| statuses | id PK, project_id (FK CASCADE), name (CHECK length 1..40), slug, category (CHECK in set; immutable after create, service rule), reviewer (nullable, CHECK `(category = 'review') = (reviewer IS NOT NULL)`), color (token name), position int NOT NULL, wip_limit int (nullable, CHECK `wip_limit > 0`), is_default bool NOT NULL DEFAULT false, created_at, updated_at. UNIQUE (project_id, name). UNIQUE (project_id, slug). Partial UNIQUE (project_id) WHERE is_default. |
| tickets | id PK, project_id NOT NULL, root_id NOT NULL, number int NOT NULL (CHECK `number > 0`), title (CHECK `length(btrim(title)) BETWEEN 1 AND 500`), description ('' md), priority (CHECK in set, DEFAULT 'none'), status_id (FK → statuses RESTRICT), parent_id (nullable), position double NOT NULL, started_at (nullable), completed_at (nullable), search tsvector GENERATED ALWAYS AS (`setweight(to_tsvector('english'::regconfig, title), 'A') \|\| setweight(to_tsvector('english'::regconfig, description), 'B')`) STORED, created_at, updated_at. UNIQUE (root_id, number). UNIQUE (id, root_id). FK (project_id, root_id) → projects (id, root_id) ON DELETE RESTRICT. FK (parent_id, root_id) → tickets (id, root_id) ON DELETE RESTRICT. CHECK `parent_id <> id`. Indexes (project_id, status_id), (status_id, position, id), (parent_id), (root_id, updated_at DESC), GIN (search), GIN (title gin_trgm_ops). |
| comments | id PK, ticket_id (FK CASCADE), body (CHECK length 1..200000), actor_name, actor_kind, search tsvector GENERATED ALWAYS AS (`setweight(to_tsvector('english'::regconfig, body), 'C')`) STORED, created_at, updated_at. FK (actor_name, actor_kind) → actors. Index (ticket_id, created_at). GIN (search). |
| attachments | id PK, ticket_id (FK CASCADE), filename (CHECK length 1..255 AND `position('/' in filename) = 0`), mime, size bigint (CHECK `size > 0`), sha256 (CHECK `sha256 ~ '^[0-9a-f]{64}$'`), actor_name, actor_kind, created_at. FK (actor_name, actor_kind) → actors. Index (ticket_id), (sha256). No `path`: blob path = `attachments/<sha[0:2]>/<sha>`, one function. Blob GC and finalize share one in-process lock; boot sweep unlinks files without rows. |
| pull_requests | id PK, owner (CHECK lower), repo (CHECK lower), number int (CHECK `number > 0`), url, title, state (CHECK in set), is_draft bool NOT NULL, head_ref, base_ref, review_state (CHECK in set, DEFAULT 'none'), merged_at (nullable), closed_at (nullable), checks jsonb NOT NULL DEFAULT '[]' (`[{name, workflow, bucket, link}]` sorted by workflow, name; CHECK `jsonb_typeof(checks) = 'array'`), ci_state (CHECK in set, DEFAULT 'none'), fetched_at (nullable), fetch_error (nullable), created_at, updated_at. UNIQUE (owner, repo, number). Index (state, ci_state). Row deleted in the same transaction when its last link goes. |
| ticket_pull_requests | ticket_id (FK CASCADE), pull_request_id (FK CASCADE), source (CHECK in set), actor_name, actor_kind, created_at. PK (ticket_id, pull_request_id). FK (actor_name, actor_kind) → actors. Index (pull_request_id). |
| activity | id bigint GENERATED ALWAYS AS IDENTITY PK (= cursor and sort key), batch_id (ULID, NOT NULL), root_id NOT NULL (FK → projects CASCADE), project_id NOT NULL (FK → projects CASCADE; project at the time), ticket_id (nullable, FK → tickets CASCADE), actor_name, actor_kind, action (text), field (nullable), from_value (nullable), to_value (nullable), meta jsonb NOT NULL DEFAULT '{}', created_at. FK (actor_name, actor_kind) → actors. CHECK `field <> 'description' OR (from_value IS NULL AND to_value IS NULL)`. Indexes (ticket_id, id), (root_id, id), (project_id, id). One row per changed field; status rows carry `{fromId, toId, fromCategory, toCategory}` in meta. |
| actors | name (CHECK `length(name) BETWEEN 1 AND 64 AND name !~ ':'`), kind (CHECK in set), first_seen_at, last_seen_at. PK (name, kind). Upserted first in every mutating transaction. `system` is never accepted from the header. |
| settings | key PK, value jsonb NOT NULL, updated_at. |

Ticket numbering: in one transaction, `UPDATE projects SET ticket_counter = ticket_counter + 1 WHERE id = $root AND parent_id IS NULL RETURNING ticket_counter` (throw on zero rows), then insert. Numbers are never reused; deletes leave gaps. `key` is immutable once `ticket_counter > 0` (`KEY_LOCKED`).

Kanban position: new = max + 1024 in the status; move = midpoint of the two neighbours resolved by ticket id; renumber the column in steps of 1024 by raw SQL when `next - prev < 1` or the midpoint equals a neighbour. Sort and keyset by `(position, id)`. Reorder does not bump `updated_at`.

Status inheritance: owner(P) = nearest ancestor-or-self with statuses (recursive CTE up, `depth < 64`); scope(P) = P plus descendants not crossing an owner (recursive CTE down). Invariant: `tickets.status_id` belongs to owner(ticket.project). `remapScope(tx, projectId, toOwnerId)` runs on first-status create, clear, re-parent, and project move; match (name, category) → category by lowest position → default; `system:trellis` actor, one batch. `moveTicketsTo` must share `project_id` with the deleted status. `category` immutable; `completed_at` set on entering done or canceled and cleared on leaving; `started_at` set once on leaving todo.

Search: exact `KEY-n` first; then `websearch_to_tsquery('english', q) || to_tsquery('english', last || ':*')` over `tickets.search` and `comments.search` (grouped by ticket) ranked by `ts_rank`; unioned with `title <% q` ranked by `word_similarity` (`pg_trgm.word_similarity_threshold = 0.4` set after migrate); deduped, limit 20. List queries select explicit columns; `description` and `search` are returned only by `get`.

Migrations: `0000_extensions` made with `drizzle-kit generate --custom` (journal entry), body `CREATE EXTENSION IF NOT EXISTS pg_trgm`; `pg_trgm` passed to the `PGlite` constructor; `0001_init` generated. Applied at boot in one transaction. CI runs `drizzle-kit generate` and fails on a non-empty `git status --porcelain drizzle/`. No triggers anywhere; every rule above is a constraint or a service function that takes `tx`.

### Critical Files for Implementation
- /Users/navidkhan/projects/trellis/apps/server/src/db/schema.ts
- /Users/navidkhan/projects/trellis/apps/server/src/db/tx.ts
- /Users/navidkhan/projects/trellis/apps/server/src/services/statuses.ts (owner/scope CTEs, `remapScope`, transitions)
- /Users/navidkhan/projects/trellis/apps/server/src/services/tickets.ts (numbering, cycle check, project move, delete ordering, blob GC)
- /Users/navidkhan/projects/trellis/apps/server/drizzle/0000_extensions.sql (plus `meta/_journal.json`)