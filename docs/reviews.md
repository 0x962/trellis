# Local pull request reviews

Open **Reviews** in the sidebar, or select **Show diff** on a ticket's pull request.
Select **Open review**, then paste a GitHub PR URL or `owner/repo#123`.
The index groups local reviews by repository.
The native URL is `/reviews/owner/repo/123`.
A review can exist without a ticket.

The Changes tab uses Pierre Trees for file navigation and Pierre Diffs for code.
The tree supports file search, keyboard navigation, Git status, and thread counts.
The diff supports syntax colors, split and unified layouts, and inline threads.
The layout choice persists in the browser.
Click a code line or line number to add a comment.
Drag across line numbers to comment on a range.
The comment sheet shows the file, side, and range.
Draft text persists in the browser. Added drafts appear inline and in Discussion.

Discussion holds local threads, draft findings, submitted reviews, and read-only GitHub conversation.
Threads support replies, edits, resolve, reopen, and eight reactions.
A stale edit returns a version conflict.
Thread links open Discussion at the selected thread.
Session controls copy the recorded session identifier.

The Checks tab shows GitHub checks and their log links.
GitHub status refreshes every 45 seconds.
The displayed diff stays on its saved revision until you select **Refresh from GitHub**.
A changed head or base produces a notice.
Older threads retain their original revision. Imported Margin threads have an unknown revision.

**Submit review** saves the verdict, summary, and selected findings in one transaction.
The submitted findings form a fixed snapshot.
Later replies, edits, or resolutions do not change that snapshot.
Choose the exact agent recipients, or select **Submit without a notification**.
Local approval does not approve the PR on GitHub.

GitHub actions use a separate sheet.
The server checks the reviewed head before an action.
Merge commands also pass the head hash to GitHub.
Live Branch controls appear for `canary-technologies-corp/canary`.
Environment commands run only after an explicit form submission.

## CLI

```sh
trellis review open owner/repo#123 --browser
trellis review prs
trellis review list owner/repo#123
trellis review list owner/repo#123 --all --json
trellis review add owner/repo#123 --path src/app.ts --start-line 10 --line 14 --side old --author reviewer --body "Check this branch."
trellis review reply <thread-id> --body "Fixed in the latest commit."
trellis review edit <thread-id> --body "Updated finding."
trellis review edit <reply-id> --thread <thread-id> --body "Updated reply."
trellis review resolve <thread-id>
trellis review reopen <thread-id>
trellis review react <message-id> +1
trellis review react <message-id> +1 --remove
trellis review submit owner/repo#123 --threads <id1,id2> --notify <run-id> --body "Review complete."
trellis review submit owner/repo#123 --threads <id1,id2> --no-notify
trellis review show <review-id> --json
trellis review inbox --run <run-id>
trellis review read <review-id> --run <run-id>
trellis review resend <delivery-id>
```

Use `--body -` to read Markdown from stdin.
Use `--session` on add or reply to record the author session.
The session defaults to `TRELLIS_SESSION`, then the resolved CLI session.
The existing `CLAUDE_SESSION_ID` integration still applies.
Use `TRELLIS_ACTOR=agent:<name>` for a named agent.
JSON output supports scripts. `list --jsonl` emits one thread per line.

Agents read existing local comments before work.
They reply to findings and resolve only addressed threads.
Review findings never become GitHub comments.
Generated Trellis instructions include this workflow.

## Agent notifications

The submission transaction also writes one delivery per selected agent run.
A background task claims pending deliveries every three seconds.
It sends the review link through the run's saved command, tmux, or Superset transport.
The notification tells the agent to read the fixed review snapshot and acknowledge it.

A stopped agent keeps an unread inbox entry.
A failed send displays its error and permits an explicit resend.
After a restart, a delivery left in `sending` becomes `unknown`.
Trellis does not resend an unknown delivery automatically.
This avoids a duplicate message when the previous send succeeded before the server stopped.
The inbox read state remains separate from the send state.

The Runs tab uses the Dots review graph through a server adapter.
Set `TRELLIS_REVIEW_EXECUTOR_URL` to its base URL; the default is `http://dots.localhost`.
The panel lists runs, shows node output, and supports start, resume, retry, approve, and reject.
Each action checks that the run belongs to the selected PR.
The Dots executor remains a separate service.

## Margin import

The importer reads a directory of Margin comment files.
It preserves bodies, authors, sessions, timestamps, sides, ranges, replies, and resolution metadata.
It records old identifiers as aliases and assigns canonical Trellis identifiers.
Legacy ranges remain exact, including reversed ranges in existing files.
New comments require an ordered range.

```sh
trellis review import-margin --from /absolute/path/to/margin-snapshot/comments
trellis review import-margin --from /absolute/path/to/margin-snapshot/comments --apply
```

The first command previews the import.
The second command writes it in one transaction.
The default directory is `$MARGIN_HOME/comments`, or `~/.margin/comments`.
Use the same absolute source path for repeated imports.
An unchanged record is skipped. A changed source record is reported as a conflict.
The importer does not overwrite a record that Trellis already imported.
An ambiguous old identifier requires the canonical Trellis identifier.

Exports support the full Trellis format and the Margin comment format:

```sh
trellis review export owner/repo#123 > review.json
trellis review export owner/repo#123 --format margin > owner__repo__123.json
trellis backup
```

The full export includes revisions, threads, reactions, submissions, deliveries, and import aliases.
The Margin export includes the current comments and replies, with old identifiers where available.
Margin cannot represent reactions, revision hashes, or submitted review snapshots.
Keep a Trellis backup before a rollback.
The normal server backup and NDJSON export include all review tables.

## Local service cutover

The repository supplies the gateway and compatibility command.
The feature installation does not import live Margin data or stop its services.
Perform the cutover after the source snapshot and new review workflow pass your checks.

1. Stop review producers that write to Margin.
2. Back up Trellis and copy the Margin data directory to a fixed snapshot path.
3. Install this Trellis checkout with `bun packages/cli/src/index.ts install`.
4. Preview and apply the import from that snapshot.
5. Compare PR, thread, reply, resolved, session, and range counts.
6. Repeat the import and verify that it adds no records.
7. Change agent instructions and Dots review prompts to `trellis review`.
8. For older producers, install `scripts/compat/margin` as their `margin` command.
9. Transfer gateway ownership with the commands below.
10. Verify the Trellis and Dots hostnames and an old Margin review link.
11. Stop `com.margin.server` after a local review, CLI reply, and agent notification pass.

Generate a gateway service file without loading it:

```sh
trellis gateway --write-plist "$HOME/Library/LaunchAgents/com.trellis.gateway.plist"
plutil -lint "$HOME/Library/LaunchAgents/com.trellis.gateway.plist"
```

The gateway reads `~/.config/localhost-gateway/routes.json` on each request.
It preserves configured routes and supplies the Trellis and Dots defaults.
`GATEWAY_ROUTES_FILE` selects another route file.
`margin.localhost` redirects to the native Trellis review route.
The gateway accepts requests from loopback addresses and defaults to port 80.
For low ports on macOS, it uses a wildcard bind. The request handler refuses clients outside loopback.
Use `trellis gateway --port 8080` for a foreground rehearsal.

After the generated plist passes inspection, transfer port 80:

```sh
launchctl bootout "gui/$(id -u)/com.margin.gateway"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.trellis.gateway.plist"
```

Trellis and Dots share this gateway.
To remove the gateway, unload `com.trellis.gateway` and remove its plist.
The normal `trellis uninstall` command removes the Trellis server and its route; it leaves the shared gateway available for Dots.

Before Trellis accepts new review writes, rollback can use the original Margin snapshot.
After new writes, export every changed PR in Margin format before you restore Margin as the writer.
Retain the full Trellis backup for fields that Margin cannot store.

## Verification record

The source inventory is in [the integration plan](margin-integration-plan.md).
A temporary import rehearsal used the local Margin files on 2026-09-12.
It imported 68 PRs, 821 threads, and 926 replies with no conflicts.
The export matched 735 resolved threads, 527 root sessions, and 294 ranges.
A repeated import added zero records and skipped all 821 threads.
The rehearsal did not write to either live data store.

The final checks passed lint and type checks across all six workspaces.
The API suite passed 195 tests; web unit tests passed 219; CLI integration tests passed 216.
The server integration run passed 1,046 tests.
Its failures came from the existing manager-start test, including the worker suite that contains it.
That failure also reproduced on clean `main`.
Three existing Button and IconButton tests also failed on clean `main`.
The repository suite retained its existing self-exclusion failure for the session-trailer check.
The focused review and Popover component suite passed all eight tests.

Aside verified the local review workflow, cold reloads, workers, keyboard expansion, replies, reactions, and desktop and 390 px layouts.
The browser pass used an isolated server with GitHub fixtures.
The new Playwright review spec has not run through the Playwright runner.
GitHub merge, environment actions, and notifications to live agents were not executed.

The bundle-size gate remains above its limit.
Initial JavaScript measures 235.0 KB gzip, compared with 227.9 KB on clean `main` and a 220 KB limit.
Total assets measure 3,255.7 KB, compared with 921.1 KB on clean `main` and a 900 KB limit.
The review route, workers, and syntax assets load separately from the initial shell.
The implementation keeps the existing limits unchanged.
