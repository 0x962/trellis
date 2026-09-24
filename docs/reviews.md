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

## Suggested changes

Select one line or a range in the diff, then select the suggestion action in the comment editor, or press Cmd+G.
The editor inserts a ```` ```suggestion ```` block with the selected lines. Edit the lines inside the block.
An empty block deletes the lines. A block equal to the current lines is refused.
The preview and the thread draw the block as a mini diff: the current lines in red, the suggested lines in green.
The prose of the comment renders below the widget. Only the first block of a comment applies.
The server records the current lines from the patch of the reviewed revision.
For a line outside the hunks, the composer sends the lines it shows, so select **Show full file** first.

**Commit suggestion** opens a commit form with an editable message. **Add suggestion to batch** collects several suggestions.
**Commit suggestions** takes the whole batch as one commit on the head branch. One commit takes one suggestion per line.
The commit lands through the GitHub API, so a fork pull request needs edits from maintainers enabled.
The commit message names the suggesters. An applied thread resolves and shows its commit.
A suggestion on deleted lines, on a resolved thread, on a closed pull request, or on another revision cannot be applied.
**Refresh from GitHub** moves a suggestion whose lines still stand to the new revision, and marks one whose lines changed as outdated.
An apply that finds changed lines marks the suggestion outdated and stops.

A submission saves its verdict, body, and selected threads in Trellis.
The delivery loop sends the local review to the assigned agent.

Local threads draw on the Diff tab.
Threads support replies, edits, resolve, reopen, and eight reactions.
A stale edit returns a version conflict.
Thread links select their thread on the Diff tab.
Session controls copy the recorded session identifier.

The Checks tab shows GitHub checks and their log links.
GitHub status refreshes every 45 seconds.
The displayed diff stays on its saved revision until you select **Refresh from GitHub**.
A changed head or base produces a notice.
Older threads retain their original revision.

**Review changes** saves a local Comment, Approve, or Request changes verdict.
It writes one activity item for each linked ticket.

Merge and repository actions use a separate sheet.
The server checks the reviewed head before an action.
Merge commands also pass the head hash to GitHub.
Live Branch controls appear for `canary-technologies-corp/canary`.
Environment commands run only after an explicit form submission.

## CLI

```sh
trellis diff open owner/repo#123 --browser
trellis diff list
trellis diff list --project DEMO
trellis diff comment list owner/repo#123
trellis diff comment list owner/repo#123 --all --json
trellis diff comment add owner/repo#123 --path src/app.ts --start-line 10 --line 14 --side old --author reviewer --body "Check this branch."
trellis diff comment add owner/repo#123 --path src/app.ts --start-line 10 --line 11 --body "Use the helper." --suggestion "const total = sum(items);"
trellis diff comment apply owner/repo#123 <thread-id> [<thread-id>...] --message "Apply suggestions from code review"
trellis diff comment reply <thread-id> --body "Fixed in the latest commit."
trellis diff comment edit <thread-id> --body "Updated finding."
trellis diff comment edit <reply-id> --thread <thread-id> --body "Updated reply."
trellis diff comment resolve <thread-id>
trellis diff comment reopen <thread-id>
trellis diff comment react <message-id> +1
trellis diff comment react <message-id> +1 --remove
trellis diff review submit owner/repo#123 --verdict comment --body "Review complete."
trellis diff review submit owner/repo#123 --verdict approve
trellis diff review submit owner/repo#123 --verdict request_changes --body "Fix the failing branch."
trellis diff review submit owner/repo#123 --verdict comment --body "See the threads." --threads <thread-id>,<thread-id>
```

`--suggestion -` reads the replacement lines from stdin. An empty value deletes the anchor lines.
`--threads` includes the named local threads in the review sent to the assigned agent.

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
trellis diff review export owner/repo#123 > review.json
trellis data backup
```

The review export includes revisions, threads, reactions, and submissions.
The normal server backup and NDJSON export include all review tables.

Generate a gateway service file without loading it:

```sh
trellis host gateway start --write-plist "$HOME/Library/LaunchAgents/com.trellis.gateway.plist"
plutil -lint "$HOME/Library/LaunchAgents/com.trellis.gateway.plist"
```

The gateway reads `~/.config/localhost-gateway/routes.json` on each request.
It preserves configured routes and supplies the Trellis default.
`GATEWAY_ROUTES_FILE` selects another route file.
The gateway accepts requests from loopback addresses and defaults to port 80.
For low ports on macOS, it uses a wildcard bind. The request handler refuses clients outside loopback.
Use `trellis host gateway start --port 8080` for a foreground rehearsal.
To remove the gateway, unload `com.trellis.gateway` and remove its plist.
The normal `trellis host uninstall` command removes the Trellis server and its route.
