# Native pull request review in Trellis

Status: source inventory and design plan. The implementation and cutover procedure are in [Local pull request reviews](reviews.md). Live data migration remains an explicit operation.

## Outcome

Trellis owns the complete review workflow: open a PR, inspect its diff, discuss findings, submit a local review, and notify its agents. A person can complete the workflow without Margin. Agents use the Trellis CLI for all local review comments.

Existing comments, replies, authors, session identifiers, anchors, and resolution records survive the move. GitHub remains the source for PR metadata, checks, and human conversation. Local review content stays in Trellis.

The main consequences of an error are lost review history, comments on the wrong code, and feedback sent to the wrong agent. The implementation sequence puts those contracts before the page.

## Evidence and scope

This inventory uses the local source on 2026-09-12:

- Margin: `/Users/navidkhan/projects/margin`, commit `90b458e7ff6a7b866d1dd25da90ef4ad68c808ca`.
- Trellis: this checkout, commit `87de84e79bf76b9b95b983a5c8880b6f644b758e`.
- Both checkouts had no changes at the start of the inventory.
- A read-only scan of `~/.margin/comments/*.json` found 68 PR files, 821 threads, and 926 replies.
- Of those threads, 735 were resolved, 527 held a session identifier, and 294 held a line range.

These counts describe a point in time. The importer must calculate them again from its final snapshot.

Aside also inspected the live [Margin review for PR 21](http://margin.localhost/https://github.com/0x962/trellis/pull/21) and [Trellis ticket TRL-13](http://trellis.localhost/t/TRL-13). Both pages rendered. The check confirmed split/unified modes, inline thread controls, file search, and the Dots iframe. Shift+click moved the web comment anchor to one line instead of a range. The Trellis PR title opened GitHub's `/files` page.

A 420 px same-origin test frame showed horizontal overflow in Margin's controls and inadequate space for its diff. This was a frame test, not a real mobile-device test. The inspection did not submit a comment, review, merge, environment command, or agent notification.

The official [Diffs documentation](https://diffs.com/docs) and [feature examples](https://diffs.com/) describe split/unified layouts, annotations, line selection, and theme customization. These support the renderer choice; the integration spike must still verify the exact package APIs in Trellis.

The planning pass checked all 25 local document links and the Margin source references. It ran no application tests because this change adds only the plan. The browser check did not verify mutation behavior or SSE delivery; Trellis displayed a Connecting indicator during the inspection.

### Margin feature inventory

Every row below is part of replacement acceptance, except where the row explicitly identifies a new feature or a separate dependency.

| Area | Current Margin behavior | Trellis disposition | Evidence |
|---|---|---|---|
| Open a PR | Full GitHub URL, embedded Margin URL, `owner/repo#123`, and `owner/repo/123` | Accept these inputs and route to one canonical review URL | M1 |
| Review list | PRs with local comments, open/resolved counts, latest activity | Native Reviews page, including PRs without ticket links | M2, M3 |
| PR switcher | Search the signed-in user's open PRs; current query limits results to 30 | Native searchable switcher with an explicit result limit | M1, M4 |
| PR header | Title, author data, branch names, file count, additions/deletions, draft/open/merged/closed state | Native header with linked tickets | M1, M3 |
| Conflicts and stacks | Conflict banner and GitHub conflict link; ordered stack navigation; up to 50 stack entries | Native state and stack navigation | M1, M3 |
| Text diff | `@pierre/diffs` `CodeView`, syntax colors, unified/split modes, sticky file headers, virtual scroll | Wrap the same library in `packages/ui` | M5 |
| File tree | `@pierre/trees`, search, folders, file status, change counts, open-thread counts, jump to file | Native tree with Trellis tokens; retain the library if it meets the UI contract | M6 |
| Diff preference | Unified/split choice in browser local storage | Remember the preference on desktop and narrow screens | M3 |
| Inline anchors | Old/new side and line; CLI also accepts a start line | Preserve anchors; add range selection to the web UI | M2, M5, M7 |
| Unprinted anchors | Thread above the first hunk when its line is absent from that file's patch | Explicit outdated/unplaced threads with original context | M5 |
| Thread lifecycle | Add, edit the root, reply, resolve, reopen; resolved threads collapse | Native local threads with the same actions | M2, M8 |
| Thread identity | Author, dates, optional session; copy session identifier | Reuse Trellis actors; retain original display names and session metadata | M2, M8 |
| Composer | Markdown, multiline text, Cmd/Ctrl+Enter, Escape, submit state | Shared Trellis composer behavior with persistent drafts | M9 |
| Conversation | PR body, GitHub comments and review verdicts, local threads, jump to anchor | Read-only GitHub section and a native local thread list | M1, M10 |
| Images | Sanitized Markdown plus a server proxy for private GitHub screenshots | Preserve private-image display with a constrained server endpoint | M11 |
| CI | Check names, workflow, pass/fail/pending/skipped/canceled state, counts, external log links | Extend Trellis's existing check surface and poller | M1, M3 |
| GitHub actions | Approve, squash merge, admin squash merge, auto-merge on/off, queue/dequeue, close, ready, update branch | Explicit human actions, separate from local review submission | M1, M12 |
| Deploy on merge | Detect and toggle the repository's `00_AUTO_DEPLOY` label | Repository-specific control | M1, M12 |
| Live Branch | Canary environment status, persistence status, URLs, pod/ref/time, workflow logs, create/redeploy/delete | Repository-specific native panel | M13 |
| Automated review | Embedded Dots run board, PR target, worktree path, new-run entry | Native Trellis run surface backed by an explicit executor adapter | M14 |
| Freshness | Comments poll every 2.5 seconds; side data every 45 seconds; faster status polls; manual refresh | Trellis SSE for local writes; shared GitHub jobs for remote data | M3 |
| Host integration | PR title and status favicon, deep URLs, localhost gateway | Native page metadata, old-link redirects, shared gateway handoff | M3, M15 |
| CLI | `open`, `list --all`, `add`, `reply`, `edit`, `resolve`, `reopen`, `prs`; stdin bodies; JSON in pipes | `trellis review` command family | M7 |
| Storage and operation | One JSON file per PR; `MARGIN_HOME`; Bun server and separate gateway under launchd | Trellis database, export/backup, importer, one application server | M2, M15 |
| Reactions | No reaction field, store operation, endpoint, or thread control in the inspected source | New required feature | M2, M8 |
| Submit review and notify | No local review submission record or agent delivery mechanism | New required feature | M2, M3, M7 |

Margin does not store commit hashes with anchors. It cannot establish that the same line number still names the reviewed code. Threads whose entire file leaves the patch remain available through Conversation, but the diff iterates only current patch files. Its web composer selects one line; a stored range comes from the CLI. The inspected source provides Markdown screenshots, not an image comparison viewer.

### Trellis integration points

| Existing surface | Reuse or required change | Evidence |
|---|---|---|
| PR identity | Keep the unique `(owner, repo, number)` record and optional ticket links | T1 |
| PR retention | Change last-unlink, ticket-delete, and project-delete cleanup before review rows depend on PRs | T2 |
| Diff endpoint | Replace the 1 MB text cut with a revision-aware file manifest and complete per-file content | T3 |
| GitHub runner | Reuse `gh`, interactive/poller slots, batched checks, error contracts, and cache invalidation | T4 |
| Ticket comments | Reuse visual primitives and interaction patterns; keep PR threads in their own domain | T1, T5 |
| Actors and sessions | Reuse actor headers; store session metadata on messages, not only ticket activity | T5, T6 |
| Live updates | Extend shared events, server filtering, query keys, and reconnect invalidation | T7 |
| Agent messages | Existing `prepareSend` reaches only running `agent_runs`; use it after a committed submission | T8 |
| Manager dispatcher | Existing batches live in memory and target project managers; they are not a durable review inbox | T9 |
| Flows | Current contract saves graph definitions; it exposes no run/start/resume operations | T10 |
| PR entry | `DiffLink` opens an external URL from `diffUrlTemplate` | T11 |
| UI rules | Use the existing shell, tokens, Base UI behavior, circular icon actions, and shared gallery | T12 |
| Architecture tests | Existing PR tests expressly prohibit diff dependencies; remove obsolete assertions in the viewer change | T13 |

## Product design

### Navigation and page structure

Add `/reviews` to the main sidebar. The page lists recent local reviews and supports a PR URL input. Filters cover project, repository, PR state, and unresolved threads. A PR does not require a ticket to appear here.

Use `/reviews/$owner/$repo/$number` as the canonical page. The URL retains the tab, selected file, thread, and explicit revision when necessary. Old Margin URLs normalize to this route. Back returns to the prior ticket or list without loss of its filters or scroll position.

The ticket PR card opens this page within Trellis. Keep an explicit Open on GitHub action. Add review counts and the latest local submission state to the card. Keep GitHub approval state distinct from the local review verdict.

The page uses the Trellis shell with a compact PR header. The main view contains a file rail and a diff pane. A resizable rail and an optional collapsed application sidebar leave room for split diffs. Tabs expose Changes, Discussion, Checks, Runs, and Live Branch when the repository supports it.

Discussion contains local threads and submission history. GitHub conversation occupies a clearly named read-only section. The Runs tab preserves the automated review workflow that Margin currently exposes through Dots.

### Review interactions

Click a line number to select an anchor. Drag or Shift+click to select a same-side range. An accessible Add comment action opens the composer. The composer shows the path, side, and range before the user saves.

Each thread offers reply, edit, resolve/reopen, reaction, copy link, and session details. The thread list supports open/resolved/all filters and a path search. Next/previous unresolved thread moves both the file selection and focus. Resolved threads collapse without loss of their replies.

Use one shared thread visual in `packages/ui` for the ticket and PR surfaces. Domain hooks own their different mutations. Extract the visual from the current ticket feature instead of importing that feature into Reviews. This also supplies one reaction control and one Markdown style.

The default web review uses a draft batch. Draft messages autosave locally and show the saved state. The submit sheet shows the selected threads, optional summary, verdict, reviewed revision, and exact agent recipients. It offers Comment, Changes requested, and Approved as local verdicts.

CLI findings save immediately so concurrent review agents can read and deduplicate them, as they do with Margin. A later submission groups selected findings into a review and sends one notification per recipient. Immediate comments, edits, replies, and reactions do not each notify agents.

Drafts remain local to the reviewer workflow; actor names are attribution, not an access-control boundary. A refresh or tab change keeps draft text. Cancel closes the composer; Discard removes the draft explicitly. Draft changes never enter a submitted snapshot silently.

### UI acceptance

- Match Trellis typography, density, square surfaces, light/dark themes, focus treatment, and tokens.
- Use circular `IconButton` actions with named tooltips in bars and panels. Use text buttons for form actions in the submit sheet.
- Keep the code font monospace and the discussion font consistent with ticket comments. Use tabular numbers for lines and counts.
- Bridge Trellis theme variables into the diff library's Shadow DOM. Follow the explicit Trellis theme, including when it differs from the OS theme.
- Preserve file position and composer focus after SSE events, thread updates, and split/unified changes.
- At narrow widths, show unified diffs and move file navigation into a sheet. Keep the desktop preference for later use.
- Provide keyboard access to the tree, line selection, thread navigation, reactions, and submission. Announce save and delivery state.
- Add review actions to Trellis's command palette and shortcuts dialog. Avoid collisions with existing global and ticket shortcuts.
- Meet the repository's 28 px desktop and 44 px mobile hit areas. Check contrast, reduced motion, empty states, and actionable error states.
- Lazy-load the diff renderer and syntax workers from Reviews. The board and ticket routes must not download the diff bundle.

## Data and API design

### Records and invariants

Keep `pull_requests` as the shared identity. Add an explicit retained-review state so standalone reviews survive ticket unlink and deletion. Extend the poller to include retained open reviews without ticket links. Closed standalone reviews stop routine polls but support manual refresh.

| Proposed record | Purpose and required fields |
|---|---|
| `pr_review_revisions` | PR, base/head commit hashes, actual comparison base, fetch time, patch/content references, completeness state |
| `pr_review_threads` | PR, original revision, original/current path, side, start/end line, anchor context, placement state, resolution actor/time, version |
| `pr_review_messages` | Thread, root/reply relation, Markdown, actor, original author display name, session/runtime/run metadata, timestamps, version |
| `pr_review_reactions` | Message, reaction key, actor; unique message/key/actor tuple |
| `pr_reviews` | PR, reviewer, draft/submitted state, verdict, summary, revision, submitted time, request identifier |
| `pr_review_entries` | Review membership and immutable submitted message/body/anchor snapshots |
| `pr_review_recipients` | Review and explicit run or session destination, with project/ticket context |
| `pr_review_deliveries` | Recipient, review, pending/sent/failed/unknown state, attempt time and error |
| `pr_review_imports` | Source store/file/legacy identifier, new identifier, source hash, import time |

The final schema can combine records where the contract stays clear. Keep these invariants in database constraints and service tests:

- One PR identity serves all linked tickets and standalone reviews. A ticket delete removes its link, not review history.
- One thread belongs to one PR. Every reply belongs to that thread. A reaction belongs to a message in that thread.
- Original anchors and submitted snapshots remain immutable. Current placement never overwrites the evidence of what the reviewer saw.
- Root and reply messages retain their own actor and session. A copied session is not proof that Trellis can reach that session.
- Resolution belongs to the thread and records who resolved it. Reopen clears the active resolution and retains the history event.
- Edits use expected versions. Concurrent authors cannot silently overwrite each other.
- Reactions use explicit add/remove operations, not a retry-sensitive toggle. Support the standard eight reaction keys with accessible text labels.
- Imported identities retain their exact display text, including names outside the Trellis actor-header grammar. Do not infer a human from a missing session.
- All review writes use `(ctx, tx, input)` services. All database queries receive `tx`.

### Diff transport and anchors

Read GitHub outside the database transaction through the existing prepared-service pattern. Resolve the PR's comparison commits first. Cache content by immutable commit pair and file, rather than PR identifier alone.

Return a file manifest with old/new paths, status, additions/deletions, binary state, and patch availability. Fetch complete file patches or base/head file content on demand. Preserve the distinction between a complete patch, a binary file, and an unavailable or oversized file. Never pass a byte-truncated hunk to the parser as a complete diff.

The first implementation spike must prove the GitHub transport for forks, stacks, merge-base comparisons, pagination, and large patches. A missing file patch needs an explicit file-content path or an explicit unavailable state. It must not make the file disappear. Full binary image comparison is an optional addition; readable binary status and Markdown screenshots are required.

Store the exact revision with each new anchor. A new push marks the loaded revision as older and offers Refresh. It does not move an open composer onto new code. A comment remains valid against its original revision even when the head changes during a save.

After refresh, map an anchor only when the code context and rename mapping establish one location. Otherwise show it as outdated or unplaced. Keep such threads in Discussion and in a dedicated file group, including when the file leaves the current diff. Imported Margin anchors have an unknown original revision; retain that uncertainty instead of assigning today's head hash.

Use `@pierre/diffs` for rendering and selection only. Trellis owns persistence, anchor placement, revision identity, and review state. Margin currently has version 1.4.1 installed; its package declares React 18/19 peer compatibility. Pin the exact version selected after the integration spike and a current release check.

The [CodeView contract](https://diffs.com/docs#codeview) requires stable item identifiers and version updates when content changes. Keep item, option, and annotation objects stable across unrelated updates. A line annotation has one anchor line; store the selected range in Trellis metadata and render its range label explicitly. The [worker pool](https://diffs.com/docs#worker-pool) is experimental, so the spike must verify its Vite build and update behavior. Virtualization limits mounted content; it does not remove the need to bound network payloads and retained file memory.

### Contract surface

Add `reviews`, `reviewThreads`, and `reviewMessages` contracts in `packages/api`. Reuse `pullRequests` for metadata, refresh, checks, file manifests, content, and explicit GitHub actions. Keep URLs and CLI refs in a shared parser.

Required operations cover PR lookup/open, review list/detail, draft save/discard, submission, recipient selection, notification status, thread list/detail/create/resolve/reopen, message edit/reply, and reaction add/remove. Define pagination for threads, messages, reviews, and GitHub conversation. Provide an explicit summary query for counts.

Add `review.*`, `review-thread.*`, `review-message.*`, and delivery events to the shared event schema. Events carry PR identifiers, linked project/ticket scopes, and entity versions. Standalone PR streams need a PR filter because their project/ticket arrays can be empty. Extend the event matcher and client query keys together.

Keep full diff text and discussion bodies out of routine SSE events. Patch counts and state where possible; refetch only the affected content. A reset or reconnect re-reads durable review and delivery state.

Store revision blobs under the Trellis data home. Extend backup, restore, export, and blob collection for all new records and retained content. Add the new write-heavy tables to maintenance where applicable.

## Agent notifications on submission

Submission is the delivery boundary. One transaction freezes the review snapshot, records its recipients, and creates pending delivery rows. The request carries a stable identifier so a double click or repeated CLI request returns the same submission.

Recipient defaults come from explicit PR/run associations. Suggest the associated builder, and show the project manager as a separate choice. If several tickets or builders match, require a recipient choice in the submit form. Never send to all agents in a repository by name matching. CLI submission requires `--notify` recipients or an explicit `--no-notify`.

After commit, the delivery worker sends through the existing runtime adapter. The message contains the PR, review identifier, verdict, unresolved count, local URL, and the exact CLI command to read the submission. It instructs the builder to read existing threads, reply to findings, and resolve only the threads it addresses.

Submission stays saved if a terminal send fails. A stopped or unreachable agent leaves a pending or failed delivery visible in the review. A user can select a new recipient or explicitly resume an agent. Submission does not silently create a workspace or a new agent session.

Terminal send has no transactional acknowledgement. A crash after send but before the database update leaves delivery uncertain. Mark that attempt Unknown and offer explicit resend. Do not promise exactly-once terminal delivery. Include the stable review identifier so an agent can recognize a repeated pointer.

Persist pending work across a server restart. The worker sends only unattempted pending rows automatically. Failed and uncertain attempts require an explicit resend. This recovery behavior is part of the notification feature, not a general retry layer.

Add a durable agent inbox/read operation for submitted reviews. Extend agent briefs and resume prompts to include unread review identifiers. Track receipt/read separately from terminal send and from resolution. Keep ordinary review message events out of the old manager wake path so a submission does not produce duplicate notifications.

External agents with only a session string can read and acknowledge reviews through the CLI. A session string alone does not authorize or locate a terminal. Show that delivery limitation until an explicit adapter or run association exists.

Local Approved does not post a GitHub approval or move a ticket to Done. Existing human completion policy stays in the service layer. Explicit GitHub approval and merge controls remain separate actions.

## CLI and agent instructions

Use a dedicated `trellis review` namespace. Preserve the existing `trellis pr add/list/rm/refresh/diff` ticket-link commands.

| Margin command | Proposed Trellis command |
|---|---|
| `margin open <pr>` | `trellis review open <pr>` |
| `margin prs` | `trellis review prs` |
| `margin list <pr> [--all]` | `trellis review list <pr> [--all]` |
| `margin add <pr> ...` | `trellis review add <pr> --path ... --line ... --start-line ... --side old\|new --body ...` |
| `margin reply <id> --body ...` | `trellis review reply <id> --body ...` |
| `margin edit <id> --body ...` | `trellis review edit <id> --body ...` |
| `margin resolve <id>` | `trellis review resolve <id>` |
| `margin reopen <id>` | `trellis review reopen <id>` |
| New | `trellis review show <review-id>` and `trellis review thread <thread-id>` |
| New | `trellis review react <message-id> <reaction> [--remove]` |
| New | `trellis review submit <pr> --verdict ... --notify <run-id> --body ...` |
| New | `trellis review inbox`, `trellis review read <review-id>`, and `trellis review resend <delivery-id>` |
| New | `trellis review import-margin --from <path>` |

Submission accepts explicit thread identifiers, a saved draft identifier, or the current actor's unsubmitted findings on that PR. It must never collect another reviewer's findings implicitly. A review with no findings can still submit its summary and verdict.

Preserve `--body -`, JSON output in pipes, `--json`, `--jsonl`, and useful exit codes. Use Trellis's `--as` and `TRELLIS_ACTOR` identity rules. Add an explicit `--session` and a harness-neutral `TRELLIS_SESSION` source ahead of existing session environment variables. Keep legacy identifiers addressable through the import map; report ambiguity if an old short identifier collides.

The CLI uses HTTP only. It never writes review tables or Margin files directly. Import reads a selected local source and sends a validated import payload to the server.

Update generated agent instructions, builder/reviewer/manager prompts, and the Dots review briefing in the same rollout. The instructions require agents to read existing local comments before work, post local findings, and resolve addressed threads. They must not direct agents to post findings on GitHub. Review summaries should reference the structured submission instead of relying only on a free-text verdict in a ticket comment.

## Remaining Margin surfaces

### GitHub and repository integrations

Port the ten explicit GitHub actions and their supported/disabled states. Show the current checks, merge queue, auto-merge, conflicts, and draft state beside them. Pass the expected head revision where the GitHub operation supports it. Surface GitHub's actionable refusal and refresh the state after a successful action.

Keep approval and merge actions human-initiated. Local review submission never invokes them. Keep administrative merge and environment deletion behind explicit controls that describe their effect.

Keep Canary labels, workflow comment parsing, and Live Branch URLs in a repository integration module. Preserve current create/redeploy/delete behavior and persistence display. These workflow commands post GitHub slash-command comments; they are explicit environment operations, not local review findings. Do not post them as part of a review submission.

Serve private screenshots through a constrained image endpoint. Validate source hosts, paths, redirects, content types, and byte limits before use. Keep credentials on the server. Reuse Trellis's safe inline-content policy for SVG and HTML.

### Automated review runs

Margin's Review tab is a Dots iframe. Trellis's current Flows page edits definitions but has no execution contract. Native review-run parity is therefore a separate work item, not an existing capability to wire up.

Add a narrow executor adapter for start, list, detail, resume, node output, and follow-up. The initial adapter can use Dots while the Trellis UI owns the entire interaction. Bind every run to the PR, reviewed revision, and verified worktree. Read the project repository configuration rather than assuming `~/projects/<repo>`.

Move the review briefing to `trellis review` commands. The run page must show checker findings through the same thread store. It must also make a completed automated review available as a local submission.

This plan removes Margin as a service and user surface. Replacement of the Dots execution engine is a separate flow-runtime project. If that project supplies native execution first, use its contract and omit the temporary adapter. Neither path may require a Margin iframe or CLI.

## Implementation sequence

Each slice starts with a failing behavior test and ends with a small reviewable PR. Slice numbers express dependencies, not calendar estimates.

| Slice | Deliverable | Acceptance and dependency |
|---|---|---|
| 1. Diff spike | Tokenized `@pierre/diffs` prototype in the gallery; immutable diff transport proof | React compatibility, both modes, annotations, ranges, Shadow DOM theme, large patch and worker build verified |
| 2. PR retention | Standalone PR lookup, review retention, cleanup and poller changes | Last unlink, ticket delete, and project delete preserve retained PRs; existing PR behavior passes |
| 3. Local review domain | Revision, thread, message, reaction contracts and database services | Concurrent writes, old/new ranges, cross-PR refusal, versions, resolve/reopen, reaction idempotence; depends on 2 |
| 4. CLI parity | `review` list/add/reply/edit/resolve/reopen/open/prs and identity support | HTTP smoke tests, stdin, JSON, session metadata, offline GitHub local reads; depends on 3 |
| 5. Diff page | Canonical route, header, file rail, split/unified viewer, PR card navigation | Complete files, renamed/deleted/binary files, deep links, lazy bundle; depends on 1 and 2 |
| 6. Review UX | Inline threads, shared thread visuals, reactions, filters, drafts, outdated anchors | Real-browser write/read flow across CLI and UI, both themes, narrow layout, keyboard use; depends on 3 and 5 |
| 7. Submission | Immutable review snapshots, recipient selection, durable inbox and delivery worker | Double submit, restart, send failure, stopped/unknown agent, multiple builders, no GitHub writes; depends on 4 and 6 |
| 8. GitHub parity | Conversation, screenshots, stacks, all GitHub actions, deploy label, Live Branch | Stubbed operation tests and read-only browser verification; depends on 5 |
| 9. Automated runs | Native run UI and the selected executor contract; updated review briefing | Start/resume/output/target association and findings in Trellis; depends on 4 and 5 |
| 10. Import and export | Dry-run importer, legacy mapping, full data export and backup/restore support | Real-store copy round trip, duplicate import, invalid/colliding records, rollback export; depends on 3 and 7 |
| 11. Cutover | Default native links, instruction updates, compatibility shim, gateway handoff, service retirement | Full acceptance below; depends on 6 through 10 |

Import development can start after slice 3. Final import validation waits for the complete schema. Split slice 8 into separate small PRs for metadata, actions, and repository integrations. Split slice 7 into submission storage, delivery, and UI if needed.

Use unit tests beside pure modules, component tests in `packages/ui`, server/CLI integration tests under `test/int`, and web E2E tests in `apps/web/e2e`. Run the relevant unit suite, lint, and type checks for each slice. Run `bun run test:int` before each PR and after database, CLI, or app integration changes. End service tests with `assertStatusInvariant(tx)`.

Add explicit fixtures for a push during composition, an absent file, a rename, overlapping old/new line numbers, an unknown imported revision, and a patch above 1 MB. Test submission recovery at the transaction/send boundary. Check SSE filters for both standalone and multi-ticket PRs.

Verify browser behavior with Aside at desktop and narrow widths. Use real application endpoints with a temporary Trellis data home for mutations. The full `bun run check` and performance suites remain optional under the repository rules. The renderer spike and viewer slice still require a bundle/large-diff measurement because the new library affects those paths.

## Import, cutover, and rollback

1. Produce a read-only import report from a copy of the Margin store.
2. Validate every source field and report malformed records and short-identifier collisions with their source paths.
3. Import into a temporary Trellis data home and compare every field, root/reply relationship, count, and timestamp.
4. Repeat the import and prove that it creates no duplicate records or notifications.
5. Test Trellis backup, restore, and export with the imported review history and revision blobs.
6. Prepare a thin `margin` compatibility command that forwards to Trellis HTTP/CLI and preserves the old output contract.
7. Switch agent producers, including the Dots briefing, to `trellis review` commands.
8. Pause remaining Margin writes and drain active writers before the final snapshot. Stopping only the server does not stop its direct-file CLI.
9. Import the final snapshot with source hashes, then verify the complete record comparison again.
10. Enable native links and old-link redirects. Verify that old comment identifiers reach the imported threads.
11. Move shared gateway ownership before stopping `com.margin.gateway`. Verify Trellis and Dots hostnames after the handoff.
12. Stop `com.margin.server` after the acceptance checks pass. Keep the source snapshot and compatibility command for the transition.

Import never sends notifications, creates agents, or posts to GitHub. It uses a source identifier plus PR and legacy identifiers for idempotence. A changed source record produces a reported update or conflict; it never overwrites a newer Trellis edit silently.

For rollback before cutover, remove the temporary import and keep Margin as the writer. After Trellis accepts new writes, an old Margin snapshot alone is not a safe rollback. Export the new comments, replies, edits, and resolution states in Margin-compatible form before a rollback. Keep reactions and submitted reviews in a complete Trellis backup because Margin cannot represent them. The release must include and verify this export before retirement.

Remove `diffUrlTemplate`, its settings field, external-viewer helpers, obsolete tests, and related docs when native review becomes the default. Preserve old deep links through a redirect handler, not through the removed settings surface. Update installation/uninstallation and public-URL support to match gateway ownership.

The mobile app can open the responsive review page at the configured public Trellis URL. Native Expo diff rendering is outside this replacement. Existing mobile PR and ticket reads must continue to pass their contract tests.

The gateway currently runs from the Margin source directory and serves Dots plus configured routes. Merely unloading everything named `com.margin.*` would also remove those hostnames. Treat its move as a separate cutover step.

## Definition of complete

- A person reviews an arbitrary PR from Trellis, with or without a linked ticket.
- Split and unified views preserve anchors, drafts, focus, and file position.
- Web and CLI share one local thread store with replies, reactions, resolution, and session metadata.
- A submit records the reviewed revision and notifies only its selected recipients, with visible durable delivery state.
- A builder reads the submitted review, replies, and resolves a finding; the browser updates without a reload.
- Imported history passes a complete field comparison and a backup/restore round trip.
- Checks, GitHub conversation/screenshots, stacks, actions, Live Branch, and automated review runs have native entry points.
- Existing Margin URLs and identifiers still resolve during the transition.
- `com.margin.server` can remain stopped while the complete acceptance workflow passes.
- No active review producer writes to `~/.margin`, and no Trellis feature requires the Margin application.

## Source index

Margin paths below are relative to `/Users/navidkhan/projects/margin` at the recorded commit. Trellis paths are relative to this repository. Line numbers identify the inspected implementation, not future code.

| ID | Source |
|---|---|
| M1 | `src/core/pr.ts:10` ref parser; `:46` metadata; `:92` patch; `:101` checks; `:121` actions; `:167` deploy label; `:231` PR search; `:269` conversation |
| M2 | `src/core/types.ts:8` reply/comment records; `src/core/store.ts:31` reads; `:55` create; `:88` PR list; `:133` edit/reply/resolve/reopen |
| M3 | `src/client/App.tsx:52` landing; `:108` tabs and preference; `:178` refresh timers; `:270` navigation; `:340` page layout |
| M4 | `src/client/components/PrPicker.tsx:1` |
| M5 | `src/client/components/DiffView.tsx:44` annotations; `:100` CodeView; `src/client/diff.ts:11` parser |
| M6 | `src/client/components/FileTree.tsx:19` |
| M7 | `src/cli.ts:18` commands; `:62` identity; `:76` stdin; `:118` dispatch |
| M8 | `src/client/components/Thread.tsx:7` session copy; `:43` thread actions |
| M9 | `src/client/components/Composer.tsx:3` |
| M10 | `src/client/components/ConversationTab.tsx:17` |
| M11 | `src/core/image.ts:18`; `src/server.ts:144`; `src/client/components/Markdown.tsx:1` |
| M12 | `src/client/components/HeaderActions.tsx:24`; `src/core/pr.ts:145` |
| M13 | `src/core/livebranch.ts:24`; `src/client/components/LiveBranchSection.tsx:85` |
| M14 | `src/client/components/ReviewTab.tsx:5`; `src/core/pr.ts:210`; `/Users/navidkhan/projects/dots/graphs/review/briefing.md:3` |
| M15 | `src/gateway.ts:1`; `src/server.ts:120`; `~/Library/LaunchAgents/com.margin.server.plist:10`; `~/Library/LaunchAgents/com.margin.gateway.plist:10` |
| T1 | [Database schema](../apps/server/src/db/schema.ts), lines 110 and 165 |
| T2 | [PR unlink](../apps/server/src/services/pullRequests.ts), line 218; [ticket removal](../apps/server/src/services/tickets/remove.ts), line 33; [project removal](../apps/server/src/services/projectsDelete.ts), line 49 |
| T3 | [Diff schema](../packages/api/src/schemas/pullRequest.ts); [diff preparation](../apps/server/src/services/pullRequestDiff.ts), line 27; [GitHub diff](../apps/server/src/gh/diff.ts) |
| T4 | [GitHub architecture](ARCHITECTURE.md#pr-and-ci-polling); [poller selection](../apps/server/src/gh/pollerDue.ts) |
| T5 | [Comment schema](../packages/api/src/schemas/comment.ts); [ticket thread](../apps/web/src/features/ticket/Timeline/components/CommentThread/CommentThread.tsx) |
| T6 | [CLI identity](../packages/cli/src/actor.ts); [CLI context](../packages/cli/src/context.ts) |
| T7 | [Events](../packages/api/src/events.ts); [query keys](../packages/api/src/query-keys.ts) |
| T8 | [Agent communication](../apps/server/src/services/agentRuns/communication.ts), line 15 |
| T9 | [Dispatcher](../apps/server/src/agents/dispatcher.ts), lines 58 and 133 |
| T10 | [Flows contract](../packages/api/src/contract/flows.ts); [flow services](../apps/server/src/services/flows/flows.ts) |
| T11 | [DiffLink](../apps/web/src/features/prs/PullRequests/components/PullRequestRow/components/DiffLink/DiffLink.tsx), line 19 |
| T12 | [Architecture](ARCHITECTURE.md#ui-system); [repository rules](../AGENTS.md); [UI dependencies](../packages/ui/package.json) |
| T13 | [Dependency assertions](../apps/web/src/features/prs/dependencies.test.ts), line 15; [feature assertions](../apps/web/src/features/prs/index.test.ts), line 32 |
