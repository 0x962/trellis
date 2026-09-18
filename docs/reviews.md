# Pull request reviews

Open **Diffs** under a project in the sidebar, or select **Show diff** on a ticket's pull request.
Select **Open review**, then paste a GitHub PR URL or `owner/repo#123`.
The Diffs page lists the pull requests of the project, grouped by repository.
The native URL is `/reviews/owner/repo/123`.
A review can exist without a ticket.

The Changes tab uses Pierre Trees for file navigation and Pierre Diffs for code.
The tree supports file search, keyboard navigation, Git status, and thread counts.
The diff supports syntax colors, split and unified layouts, and inline threads.
The layout choice persists in the browser.
Click a code line or line number to add a comment.
Drag across line numbers to comment on a range.
The comment sheet shows the file, side, and range.
Draft text persists in the browser. Added comments appear inline and in Discussion.

Discussion holds local threads and the read-only GitHub conversation.
Threads support replies, edits, resolve, reopen, and eight reactions.
A stale edit returns a version conflict.
Thread links open Discussion at the selected thread.
Session controls copy the recorded session identifier.

The Checks tab shows GitHub checks and their log links.
GitHub status refreshes every 45 seconds.
The displayed diff stays on its saved revision until you select **Refresh from GitHub**.
A changed head or base produces a notice.
Older threads retain their original revision.

**Review changes** matches the GitHub review choices: Comment, Approve, and Request changes.
The server checks the reviewed head before it submits the review to GitHub.
The request then refreshes the pull request in Trellis.
It writes one activity item for each linked ticket.
Project managers receive that activity through the normal activity route.

Merge and repository actions use a separate sheet.
The server checks the reviewed head before an action.
Merge commands also pass the head hash to GitHub.
Live Branch controls appear for `canary-technologies-corp/canary`.
Environment commands run only after an explicit form submission.

## CLI

```sh
trellis review open owner/repo#123 --browser
trellis review prs
trellis review prs --project TRL
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
trellis review submit owner/repo#123 --verdict comment --body "Review complete."
trellis review submit owner/repo#123 --verdict approve
trellis review submit owner/repo#123 --verdict request_changes --body "Fix the failing branch."
```

Use `--body -` to read Markdown from stdin.
Use `--session` on add or reply to record the author session.
The session defaults to `TRELLIS_SESSION`, then the resolved CLI session.
The existing `CLAUDE_SESSION_ID` integration still applies.
Use `TRELLIS_ACTOR=agent:<name>` for a named agent.
JSON output supports scripts. `list --jsonl` emits one thread per line.

Agents read existing Trellis comments before work.
They reply to findings and resolve only addressed threads.
Review findings never become GitHub comments.
Generated Trellis instructions include this workflow.

Export a complete local review or back up all server data:

```sh
trellis review export owner/repo#123 > review.json
trellis backup
```

The review export includes revisions, threads, reactions, and submissions.
The normal server backup and NDJSON export include all review tables.

Generate a gateway service file without loading it:

```sh
trellis gateway --write-plist "$HOME/Library/LaunchAgents/com.trellis.gateway.plist"
plutil -lint "$HOME/Library/LaunchAgents/com.trellis.gateway.plist"
```

The gateway reads `~/.config/localhost-gateway/routes.json` on each request.
It preserves configured routes and supplies the Trellis default.
`GATEWAY_ROUTES_FILE` selects another route file.
The gateway accepts requests from loopback addresses and defaults to port 80.
For low ports on macOS, it uses a wildcard bind. The request handler refuses clients outside loopback.
Use `trellis gateway --port 8080` for a foreground rehearsal.
To remove the gateway, unload `com.trellis.gateway` and remove its plist.
The normal `trellis uninstall` command removes the Trellis server and its route.
