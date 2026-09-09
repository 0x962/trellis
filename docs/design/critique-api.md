# Adversarial critique: trellis API contract

Ranked, blockers first. Each item: problem, failure, fix (as a decision).

## Blockers

### 1. `CDE/web/auth` cannot travel in a path segment
**Problem.** `GET /api/projects/{project}` with a slash-separated path ref needs `%2F`. oRPC's OpenAPI router matches on the raw pathname, so `/api/projects/CDE/web/auth` matches nothing (or, worse, the `/api/projects/{project}/statuses` shape). `%2F` survives Hono but the Vite dev proxy, margin's gateway, and Scalar's "try it" all normalize or reject it inconsistently.
**Failure.**
```
curl http://127.0.0.1:4521/api/projects/CDE/web/auth        -> 404 (no route)
curl http://127.0.0.1:4521/api/projects/CDE%2Fweb%2Fauth    -> works direct, 404 through vite proxy
```
**Fix.** One `ProjectRef` grammar on the wire: `ULID | KEY | KEY.slug(.slug)*`, dot-separated. Regex `^(?:[0-9A-HJKMNP-TV-Z]{26}|[A-Z][A-Z0-9]{1,9}(?:\.[a-z0-9][a-z0-9-]*)*)$` after case-folding (KEY upper, slugs lower, ULID upper). The CLI and web accept `/` and rewrite to `.` before the request. `/p/CDE/web/auth` stays the web URL. No overlap is possible: a ULID has 26 chars and no dot or hyphen; a KEY has at most 10.

### 2. `tickets.list` input is not expressible as a query string
**Problem.** oRPC serializes nested GET input with bracket notation. `filter { status[], parent: null }` becomes `?filter[status][0]=todo&filter[status][1]=done&filter[parent]=` and `null` has no query-string form; smart coercion turns `""` into `""`, not `null`, so "top-level tickets only" is unreachable from curl and from "Copy as CLI".
**Failure.**
```
GET /api/tickets?filter[parent]=null      -> parent treated as ref "null" -> 400
GET /api/tickets?filter[status]=todo,done -> one status named "todo,done" -> 409
```
**Fix.** Flat input, all scalars or comma lists, no `filter`/`sort` objects. `parent=none` is the literal for top-level; `parent=CDE-42` for children; absent means "any". Arrays are `z.preprocess(splitCommas, z.array(...))` so RPC clients send arrays and curl sends `status=todo,in-progress`. Sort is one string `sort=-updatedAt`. Full grammar in the contract section below.

### 3. Actor header grammar is undefined, and the CLI heuristic flips humans into agents
**Problem.** `kind:name` with no rules: `human:Navid:Khan` splits wrong; `human:Navíd` throws `TypeError: invalid header value` in browser `fetch` (header values are ByteStrings); no length cap. Separately, the CLI sets kind `agent` when stdout is not a TTY, so a human piping output becomes an agent and gets refused.
**Failure.**
```
$ trellis move CDE-1 Done | cat
error: agents cannot complete tickets (AGENT_CANNOT_COMPLETE)   exit 4
```
**Fix.** Header grammar: `^(human|agent):([\x21-\x39\x3B-\x7E][\x20-\x39\x3B-\x7E]{0,63})$` (printable ASCII, no `:`, no leading space, 1–64 chars, trimmed). Bad value is `ACTOR_INVALID 400` with the grammar in the message. Non-ASCII git names: the CLI strips diacritics (NFKD, drop combining marks) and tells the user once to set `TRELLIS_ACTOR` for an exact name. Kind is `agent` only from `--as`, `TRELLIS_ACTOR`, or the env markers (`CLAUDECODE`, `CLAUDE_SESSION_ID`, `CODEX_*`); TTY state affects output format only. The CLI also sends `x-trellis-session: <CLAUDE_SESSION_ID>` when present; the server stores it as `activity.meta.session` so two concurrent `agent:claude-code` runs stay distinguishable. Reads: the header is optional and never touches `actors.last_seen_at`; `last_seen_at` means last mutation. EventSource cannot send headers and does not need to: `/api/events` is a read.

### 4. No optimistic concurrency: two editors clobber the description
**Problem.** Tiptap autosaves every 800 ms with the full description. An agent's `edit --description` and a human keystroke race; last write wins silently and the activity log shows a bogus "description changed" by whoever lost.
**Failure.**
```
agent  PATCH /api/tickets/CDE-42 {"description":"A...long plan"}    200
human  PATCH /api/tickets/CDE-42 {"description":"Fix typo"}         200  (agent's plan gone)
```
**Fix.** Add `version integer NOT NULL DEFAULT 1` to `tickets`, bumped on every update. Every ticket response carries `version`. `tickets.update` and `tickets.move` accept optional `expectedVersion`; mismatch is `VERSION_CONFLICT 412` with `data: {current: Ticket}`. The web sends `expectedVersion` for title and description (not for chips, where last-write-wins is correct); on 412 it shows "changed by agent:claude-code, reload or overwrite". `If-Match: "<version>"` is honored by a small Hono middleware that maps to the same field, so curl users get a standard header. No detailed input structure; the body field is the contract.

### 5. `DELETE` with a body
**Problem.** `statuses.delete { moveTicketsTo }` and `projects.delete { force }` put input in a DELETE body. Fetch allows it, but Scalar, several proxies, and `curl -X DELETE -d` habits make it the most-broken shape in the spec.
**Failure.** `curl -X DELETE /api/statuses/x -d '{"moveTicketsTo":"todo"}'` without `content-type` is parsed as form data; `moveTicketsTo` is missing; `STATUS_IN_USE`.
**Fix.** DELETE never has a body. `DELETE /api/projects/{project}/statuses/{status}?moveTo=<status>` and `DELETE /api/projects/{project}?force=true`.

### 6. SSE ids restart at 0 after a server restart
**Problem.** Ring buffer ids are process-local. A browser reconnecting with `Last-Event-ID: 850` after a restart sees ids 0–3 in the buffer; `since(850)` returns nothing, no `reset` fires, and the client misses everything that happened while it was disconnected before the restart.
**Failure.** Server restarts at seq 900. Tab reconnects with `Last-Event-ID: 850`. Server has 0..3, `850 > 3`, replies with nothing, client believes it is current.
**Fix.** Event id is `<bootId>.<seq>` where `bootId` is a ULID minted at boot. `since(id)`: different boot, or seq older than the buffer floor, emits `reset` then `ready`. `ready` payload `{id, bootId, serverVersion, apiVersion}`; `reset` payload `{reason: "restart" | "gap"}`. `?since` and `Last-Event-ID` are equivalent; header wins when both are present.

### 7. `/api/statuses/{id}` takes ULIDs only
**Problem.** Agents and the CLI know status slugs and names, never status ULIDs. `statuses rm` would need a prior `statuses list --json` and a jq.
**Fix.** Nest under the project with a `StatusRef`: `/api/projects/{project}/statuses/{status}`; `StatusRef = ULID | slug | name`, resolved case-insensitively within the project's effective set. The same `StatusRef` is used for `tickets.update.status`, `tickets.move.status`, and `?moveTo`, plus the prefix form `category:<category>` meaning "the first status of that category", which is what agents with unknown custom sets need (`move CDE-1 category:review`).

### 8. Kanban with `limit 500` truncates silently
**Problem.** One list call, grouped client-side, 500 cap. A `Done` column with more than 500 tickets in 30 days, or a big `Todo` backlog, drops rows with no indication. Also `total` is meaningless per column.
**Fix.** The kanban issues one `tickets.list` per column: `status=<slug>&sort=position&limit=100`, infinite query with `nextCursor`; `total` per column feeds the column count and WIP indicator. No new endpoint. Invalidation is per `statusId` from the event payload.

### 9. Attachments served inline on the app origin are stored XSS
**Problem.** `inline for image/pdf/text/video` plus content-addressed serving at `/api/attachments/{id}/file` means a `text/html` or `image/svg+xml` upload executes scripts on `trellis.localhost`, the same origin as the app.
**Failure.** `trellis attach CDE-1 evil.svg` then any user clicks the attachment; the SVG script reads localStorage and posts mutations with the human's actor.
**Fix.** Inline allowlist by exact mime: `image/png, image/jpeg, image/gif, image/webp, image/avif, application/pdf, text/plain, text/markdown, video/mp4, video/webm`. Everything else, including `image/svg+xml` and any `text/html`, is `Content-Disposition: attachment`. The file route always sets `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff`. Mime is taken from the multipart part and recorded; no sniffing.

### 10. The error list has holes agents will fall into
**Problem.** Missing: validation failure (undeclared, so absent from the spec), parent cycles, archived projects, version conflicts, bad cursors, status in use, move anchors in the wrong column, non-PR URLs on `link`, and the agent delete policy. `AGENT_CANNOT_COMPLETE` is a policy refusal, not a state conflict.
**Failure.**
```
PATCH /api/tickets/CDE-42 {"parent":"CDE-42"}          -> today: 200, then the ticket page recurses
POST  /api/tickets {"project":"OLD","title":"x"}       -> OLD is archived; today: 201
```
**Fix.** The final error table below. Decisions: declare `INPUT_VALIDATION_FAILED` on every procedure so it is in the spec with `data.issues`; drop `INVALID_REF` (ref grammar is a Zod regex, so it is a validation failure); `PARENT_CYCLE 409`; `PROJECT_ARCHIVED 409` on any mutation touching an archived project; `VERSION_CONFLICT 412`; `INVALID_CURSOR 400`; `STATUS_IN_USE 409` with `data.count`; `INVALID_ANCHOR 409`; `INVALID_PR_URL 400`; `AGENT_CANNOT_COMPLETE 403` and `AGENT_CANNOT_DELETE 403` (ticket and project delete by an agent, `force=true` overrides both). No `INVALID_TRANSITION`: every status-to-status move is legal by design; say so in the spec description. No rate limit: single user, loopback. No 415: any mime is stored (see item 9 for serving).

## Major

### 11. `pullRequests.link` is not idempotent
**Failure.** Agent runs `trellis pr add CDE-1 <url>` twice (retry after a slow `gh`): second call `ALREADY_LINKED 409`, exit 4, the agent stops.
**Fix.** `link` returns 200 with the existing row (refreshed) when the PR is already on this ticket. Drop `ALREADY_LINKED`. `create` procedures stay non-idempotent; no `Idempotency-Key` in v1 because loopback latency is under 10 ms and the CLI never retries.

### 12. Three filter grammars: API (`hasPr`, `ciState`, `updatedAfter`), web URL (`pr`, `updated`), CLI (`--has-pr --ci`)
**Failure.** "Copy as CLI" for the URL `?pr=failing` cannot be `--has-pr`, and `--ci fail` does not exist in the API as `pr=failing`.
**Fix.** One grammar, identical names in the API, the URL, and the CLI flags: `project, status, category, priority, parent, pr, ci, actor, q, updated, created, completed, sort, limit`. `pr = any | none | open | draft | merged | closed`; `ci = pass | fail | pending | none`. `updated/created/completed` are ISO timestamps on the wire; the CLI and web translate `24h`, `30d` before sending. `!` negation is a web-only display trick over the same fields and is out of v1 for the API.

### 13. Procedures the web needs and the contract lacks
- Bulk bar: `tickets.updateMany` `POST /api/tickets/update-many {tickets: TicketRef[≤200], set: {status?, priority?, project?, parent?}}` and `tickets.deleteMany`. One `batch_id`, one transaction, one SSE burst.
- Sidebar tree in one call: `projects.list` returns every non-archived project (or `archived=true`) flat with `parentId, depth, path, openCount, needsYouCount`; the tree is derived on the client.
- Project ordering and reparenting: `projects.move` `POST /api/projects/{project}/move {parent?, after?, before?}`, same anchor rules as tickets.
- Inbox preset and "Copy as CLI": `reviewer=human|agent` filter on `tickets.list`.
- Unread or attention markers: none. There is one human; "attention" is `inbox.get`, whose counts drive the badge.

### 14. Create and delete response shapes
**Fix.** Creates return `201` with `Location: /api/<collection>/<id>` via `ResponseHeadersPlugin`; the body is the full object. Deletes return `200 {deleted: <identifier>}` (scriptable, `--quiet` prints it), not 204.

### 15. `curl -d '{"project":"CDE","title":"x"}' /api/tickets` does not work
**Failure.** `-d` defaults to `application/x-www-form-urlencoded`; oRPC parses the JSON text as a single form key; then the actor header is missing anyway.
**Fix.** The honest one-liner is
```
curl -X POST http://127.0.0.1:4521/api/tickets -H 'content-type: application/json' -H 'x-trellis-actor: agent:claude-code' -d '{"project":"CDE","title":"x"}'
```
and form encoding also works (`-d project=CDE -d title=x` plus the actor header). Put both in `info.description` of the spec and in `trellis instructions`. `ACTOR_REQUIRED` message: `Send x-trellis-actor: agent:<name> or human:<name>`.

### 16. The OpenAPI document does not know about the actor header
**Fix.** Post-process the generated document: add `components.parameters.Actor` (header, required) and attach it to every non-GET operation; add `info.description` (actor rule, ref grammars, list grammar, the "agents never Done" rule), `tags` per router, one `example` per request body, and `servers: [http://127.0.0.1:4521, http://trellis.localhost]`. `/api/openapi.json` is what a first-time agent reads; it must be self-sufficient.

### 17. Versioning
**Fix.** No `/v1` prefix and no version header. `system.health` returns `{version, apiVersion: 1}`. Changes are additive within an `apiVersion`; a breaking change bumps it. The CLI sends `x-trellis-client: cli/<semver>` and reads `x-trellis-api-version` from every response; when the server's `apiVersion` is greater than the CLI's, it prints one warning and continues; when lower, it errors `exit 7` with the upgrade command. Both ship from one repo, so this is the whole policy.

### 18. `status` on `tickets.update`
**Fix.** `PATCH` accepts `status` (appends to the end of the column); `POST …/move` exists for ordering (`after`, `before`) and `force`. Both write the same activity row. The CLI `move` calls `move`; `edit --status` calls `update`.

### 19. Cursor integrity and `total`
**Failure.** Page 1 fetched with `status=todo`; page 2 fetched with the same cursor but `status=done`; keyset returns rows from the wrong set with no error.
**Fix.** Cursor is base64url `{v:1, h: sha1(filter+sort)[0:8], k: [sortValue, id]}`; hash mismatch is `INVALID_CURSOR 400`. `total` is a `count(*) over()` window in the same query, present on every page. Sort by `status` means `(category rank, status.position, id)`; by `priority` means `(urgent, high, medium, low, none)`. Every sort has `id desc` as tiebreak; `-` prefix is desc; default `-updatedAt`.

### 20. One SSE connection per tab hits the HTTP/1.1 limit
**Failure.** Six tabs on `trellis.localhost` (HTTP/1.1 through the gateway): the seventh tab's `fetch` calls queue behind the six open EventSources; the app looks frozen.
**Fix.** One EventSource per origin: the tab that wins `navigator.locks.request("trellis-sse")` owns the connection and rebroadcasts events over `BroadcastChannel("trellis-events")`; other tabs listen and reconnect via the lock when the leader closes.

### 21. `?types` grammar and server-side scoping for `watch`
**Fix.** `?types=ticket.*,pr.updated` (comma list; a trailing `.*` matches a prefix). `?project=<ProjectRef>` and `?ticket=<TicketRef>` filter server-side so `trellis watch --ticket CDE-42` does not receive the whole firehose. `bye` payload `{reason: "shutdown" | "restart"}`; clients show "Server restarting" instead of "Reconnecting" for 10 s.

### 22. Brief and inbox stay procedures
**Decision.** `brief.get` must be deterministic and identical from the web "copy brief" and the CLI, so it lives in the server. `inbox.get` has two sections (`stalled`, `doneByAgentsToday`) that need the activity table and are not list filters. Both stay. `inbox.get` returns four `{items, total}` sections capped at 100 each. `brief.get` returns `{markdown, generatedAt}`; the CLI prints the markdown raw.

### 23. `dry_run`, batch create, envelopes, `--quiet`
**Decisions.** No `dry_run`: every mutation is cheap and reversible, and a refusal is a typed error. No batch create: ten `sub` calls cost 50 ms on loopback. No response envelope: oRPC returns the bare output; lists are `{items, nextCursor, total}`. `--quiet` prints exactly one identifier per result line and nothing else: `CDE-42` for tickets (`create`, `sub`, `edit`, `move`, `delete`, `list`), the dotted path for projects, the ULID for comments, attachments, and PRs; `--quiet` with a void result prints nothing; the exit code is the signal.

## Minor

- `activity.list`: exactly one of `ticket` or `project` is required; both or neither is a validation failure.
- `system.export` is a plain Hono streaming route with `Content-Disposition: attachment; filename=trellis-<date>.json`, not an oRPC procedure (memory).
- `statuses.clear` on a root is `ROOT_STATUSES 409`, since a root has nothing to inherit.
- `projects.update {parent: null}` on a sub-project is invalid (a root needs a key); `projects.move` to a parent in another root is `CROSS_ROOT_MOVE`.
- Refs are case-insensitive on input; responses always carry the canonical form (`CDE-42`, `CDE.web.auth`).
- WIP limits are advisory: never an error, shown in the UI only.

---

## API contract (corrected, adopt verbatim)

Two handlers over one router: `RPCHandler` at `/rpc` (typed clients) and `OpenAPIHandler` at `/api` (curl, agents, Scalar at `/api/docs`, spec at `/api/openapi.json`). `ResponseHeadersPlugin` sets `Location` on creates and `x-trellis-api-version` on every response. `ZodSmartCoercionPlugin` for query coercion. The generated spec is post-processed to add the `Actor` header parameter to every non-GET operation, `info.description`, tags, examples, and `servers`.

Ref grammars (case-insensitive on input, canonical on output):

| ref | grammar | examples |
|---|---|---|
| `TicketRef` | `ULID` or `KEY-n` | `CDE-42` |
| `ProjectRef` | `ULID`, `KEY`, or `KEY.slug(.slug)*` | `CDE`, `CDE.web.auth` |
| `StatusRef` | `ULID`, slug, name, or `category:<category>` | `in-progress`, `In Progress`, `category:review` |

Actor: `x-trellis-actor: <human|agent>:<name>`, name printable ASCII without `:`, 1–64 chars. Required on every non-GET request (`ACTOR_REQUIRED 400`, `ACTOR_INVALID 400`); optional and ignored on GET. Optional `x-trellis-session` is stored in `activity.meta.session`.

| procedure | route | notes |
|---|---|---|
| projects.list | GET /api/projects?archived= | flat list of all projects: `id, parentId, rootId, key, slug, path, name, depth, position, openCount, needsYouCount, archivedAt`; tree derived client-side |
| projects.get | GET /api/projects/{project} | ancestors, children, repos, effective statuses, `statusesInheritedFrom`, `defaultDescription` |
| projects.create | POST /api/projects | 201 + `Location`; `key` required without `parent`, forbidden with it |
| projects.update | PATCH /api/projects/{project} | `name, slug, description, defaultDescription, archived` |
| projects.move | POST /api/projects/{project}/move | `parent?, after?, before?`; reparent and reorder |
| projects.delete | DELETE /api/projects/{project}?force= | 200 `{deleted}`; `PROJECT_NOT_EMPTY` unless `force`; agent needs `force` |
| projects.setRepos | PUT /api/projects/{project}/repos | full replace, idempotent; body `{repos: [{owner, repo}]}` |
| statuses.list | GET /api/projects/{project}/statuses | effective set with `inheritedFrom` |
| statuses.create | POST /api/projects/{project}/statuses | 201; first create in a sub-project copies the effective set in the same transaction |
| statuses.update | PATCH /api/projects/{project}/statuses/{status} | `name, color, category, reviewer, wipLimit, isDefault` |
| statuses.reorder | PUT /api/projects/{project}/statuses/order | `{statuses: StatusRef[]}` full order |
| statuses.delete | DELETE /api/projects/{project}/statuses/{status}?moveTo= | `STATUS_IN_USE` when tickets exist and `moveTo` absent; `LAST_STATUS` |
| statuses.clear | DELETE /api/projects/{project}/statuses | sub-projects only; remaps tickets by name, then category |
| tickets.list | GET /api/tickets | grammar below; `{items: TicketRow[], nextCursor, total}` |
| tickets.get | GET /api/tickets/{ticket} | ticket + `project {id, key, path, name}`, `status`, `parent {id, identifier, title}`, `children [{id, identifier, title, status}]`, `prs`, `attachments`, `commentCount`, `version` |
| tickets.create | POST /api/tickets | `{project, title, description?, priority?, status?, parent?}`; 201 + `Location: /api/tickets/CDE-43` |
| tickets.update | PATCH /api/tickets/{ticket} | `title, description, priority, status, parent (TicketRef or null), project, expectedVersion?`; `If-Match: "<version>"` maps to `expectedVersion` |
| tickets.move | POST /api/tickets/{ticket}/move | `{status, after?, before?, force?, expectedVersion?}`; anchors must be in the target column |
| tickets.updateMany | POST /api/tickets/update-many | `{tickets: TicketRef[≤200], set: {status?, priority?, project?, parent?}, force?}`; one batch, one transaction |
| tickets.deleteMany | POST /api/tickets/delete-many | `{tickets, force?}` |
| tickets.delete | DELETE /api/tickets/{ticket}?force= | 200 `{deleted: "CDE-42"}`; agent needs `force` |
| comments.list | GET /api/tickets/{ticket}/comments?cursor&limit | oldest first |
| comments.create | POST /api/tickets/{ticket}/comments | `{body}`; 201 |
| comments.update / delete | PATCH, DELETE /api/comments/{id} | ULID only |
| attachments.list | GET /api/tickets/{ticket}/attachments | |
| attachments.upload | POST /api/tickets/{ticket}/attachments (multipart) | `file`, `name?`; 201 `{attachment, url, markdown}`; `PAYLOAD_TOO_LARGE` |
| attachments.get / delete | GET, DELETE /api/attachments/{id} | metadata; bytes at plain Hono `GET /api/attachments/{id}/file` (inline allowlist, `CSP: sandbox`, `nosniff`, ETag = sha) |
| pullRequests.list | GET /api/tickets/{ticket}/prs | |
| pullRequests.link | POST /api/tickets/{ticket}/prs | `{url}`; fetches once synchronously; idempotent: existing row returns 200; `INVALID_PR_URL`, `GH_UNAVAILABLE` stores with `fetchError` |
| pullRequests.unlink | DELETE /api/prs/{id} | 200 `{deleted}` |
| pullRequests.refresh | POST /api/prs/{id}/refresh | returns the row |
| search.query | GET /api/search?q&project&limit | tickets + projects, limit ≤ 50 |
| activity.list | GET /api/activity?ticket=\|project=&cursor&limit | exactly one of `ticket`, `project`; newest first |
| inbox.get | GET /api/inbox?project= | `{review, failingCi, stalled, doneByAgentsToday}` each `{items, total}`, 100 cap |
| brief.get | GET /api/tickets/{ticket}/brief | `{markdown, generatedAt}` |
| actors.list / default | GET /api/actors, GET /api/actors/default | |
| system.health | GET /api/health | `{ok, version, apiVersion, bootId, db, gh}` |
| system.gh | GET /api/gh | |
| system.backup | POST /api/backup | `{path, bytes}` |
| export | plain Hono `GET /api/export` | streamed JSON, `Content-Disposition: attachment` |

`TicketRow` (list item): `id, identifier, number, title, priority, status {id, slug, name, category, reviewer, color}, project {id, key, path}, parent {id, identifier} | null, childCount, childDoneCount, commentCount, attachmentCount, pr {state, ciState, checksSummary} | null, lastActor {name, kind, at} | null, position, version, createdAt, updatedAt, completedAt`.

### `tickets.list` query grammar

All parameters are optional. Lists are comma-separated. Refs follow the grammars above. Timestamps are ISO 8601; the CLI and web translate relative forms (`24h`, `30d`) before sending.

| param | type | meaning |
|---|---|---|
| `project` | ProjectRef | scope; with `subprojects=false` only that project (default `true`) |
| `status` | StatusRef list | any of; slugs resolve in the effective set of each scoped project |
| `category` | list of `todo,started,review,done,canceled` | |
| `reviewer` | `human` or `agent` | review-category statuses with that reviewer |
| `priority` | list of `none,urgent,high,medium,low` | |
| `parent` | TicketRef or `none` | `none` = top-level tickets; absent = any |
| `pr` | `any,none,open,draft,merged,closed` | |
| `ci` | list of `pass,fail,pending,none` | |
| `actor` | `kind:name` or `name` | last actor on the ticket |
| `q` | string | title and description, same ranking as search |
| `updated`, `created`, `completed` | ISO timestamp | "after" bounds |
| `sort` | `[-]updatedAt` \| `createdAt` \| `priority` \| `number` \| `status` \| `position` | `-` = desc; default `-updatedAt`; tiebreak `id desc` |
| `cursor` | opaque | bound to filter and sort hash; `INVALID_CURSOR` on mismatch |
| `limit` | 1–200, default 50 | |

Example, identical in the three surfaces:
```
GET /api/tickets?project=CDE&status=in-progress,agent-review&parent=none&ci=fail&sort=-updatedAt
/p/CDE?status=in-progress,agent-review&parent=none&ci=fail&sort=-updatedAt
trellis list --project CDE --status in-progress,agent-review --parent none --ci fail --sort -updatedAt
```

### Errors

Body shape (oRPC OpenAPI): `{defined: true, code, status, message, data}`. All codes below are declared on the contract, so they appear in the spec with their `data` schema.

| code | status | data | when |
|---|---|---|---|
| INPUT_VALIDATION_FAILED | 400 | `{issues}` | any schema failure, including malformed refs |
| ACTOR_REQUIRED | 400 | | non-GET without the header; message shows the header to send |
| ACTOR_INVALID | 400 | `{grammar}` | header does not match the grammar |
| INVALID_CURSOR | 400 | | cursor from a different filter or sort, or undecodable |
| INVALID_PR_URL | 400 | | `link` with a URL that is not a GitHub PR |
| AGENT_CANNOT_COMPLETE | 403 | `{status}` | agent moves to a `done` status without `force` |
| AGENT_CANNOT_DELETE | 403 | | agent deletes a ticket or project without `force` |
| NOT_FOUND | 404 | `{kind, ref}` | well-formed ref with no target; includes status refs |
| DUPLICATE | 409 | `{field}` | project key, sibling slug, status name or slug |
| STATUS_NOT_IN_PROJECT | 409 | `{valid: [{slug, name, category}]}` | status exists but not in the ticket's effective set |
| STATUS_IN_USE | 409 | `{count}` | delete without `moveTo` while tickets use it |
| LAST_STATUS | 409 | | deleting the only status |
| ROOT_STATUSES | 409 | | `clear` on a root |
| CROSS_ROOT_MOVE | 409 | | ticket, parent, or project moved across roots |
| PARENT_CYCLE | 409 | | parent is the ticket itself or a descendant (tickets and projects) |
| PROJECT_NOT_EMPTY | 409 | `{tickets, projects}` | delete without `force` |
| PROJECT_ARCHIVED | 409 | | any mutation in an archived project |
| INVALID_ANCHOR | 409 | | `after`/`before` not in the target column |
| VERSION_CONFLICT | 412 | `{current}` | `expectedVersion` or `If-Match` mismatch |
| PAYLOAD_TOO_LARGE | 413 | `{maxBytes}` | upload over `TRELLIS_MAX_UPLOAD_MB` |
| GH_UNAVAILABLE | 503 | `{reason}` | gh missing or unauthenticated on a synchronous call |

CLI exit codes: 0 ok, 1 server error (5xx), 2 usage (400 family), 3 not found, 4 refused or conflict (403, 409, 412), 5 unreachable, 6 gh unavailable, 7 client too old.

### Live updates (corrected)

`GET /api/events?since=&types=&project=&ticket=`. Event id `<bootId>.<seq>`; `Last-Event-ID` wins over `since`. Order on connect: `reset {reason}` when the id is from another boot or below the buffer floor, then `ready {id, bootId, serverVersion, apiVersion}`. `: ping` every 15 s. `bye {reason}` before shutdown. `types` is a comma list; `prefix.*` matches. Payloads: `ticket.created|updated|deleted {id, identifier, projectId, rootId, statusId, version, fields[], batchId}`; `pr.linked|unlinked|updated {id, ticketId, state, ciState}`; `statuses.changed {projectId}`; `project.created|updated|deleted|moved {id}`; `comment.*`, `attachment.*` `{id, ticketId}`; `gh.status {ok, reason}`. Web: one EventSource per origin (Web Locks leader + BroadcastChannel). Mobile: `react-native-sse` with `since`. CLI `watch`: JSON lines, `--since` accepts an id or `boot` (from `ready`).

### Domain rules (deltas)

- Add `version` to tickets; bump on every write.
- Agent policy: `done` moves and deletes need `force=true`; everything else is allowed. Both refusals are 403.
- Archived project: reads work, every mutation is `PROJECT_ARCHIVED`.
- Every status-to-status move is legal. WIP limits are advisory.
- Changing a ticket's `project` within the root remaps status by name, then category; `number` never changes.

### Critical Files for Implementation
- /Users/navidkhan/projects/trellis/packages/api/src/refs.ts (TicketRef, ProjectRef, StatusRef, ActorHeader schemas and canonicalizers)
- /Users/navidkhan/projects/trellis/packages/api/src/contract/tickets.ts (flat list grammar, cursor, version, updateMany)
- /Users/navidkhan/projects/trellis/packages/api/src/errors.ts (the declared error map shared by every procedure)
- /Users/navidkhan/projects/trellis/apps/server/src/events/bus.ts (bootId-scoped ids, reset semantics, server-side type and scope filters)
- /Users/navidkhan/projects/trellis/apps/server/src/openapi.ts (spec post-processing: actor header parameter, info, tags, examples)