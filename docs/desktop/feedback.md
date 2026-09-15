# Desktop feedback

Owner: lead agent. Integration branch: `trellis-readiness-audit`.
Last update: 2026-09-15.

## Current work

| Feedback | Status | Owner | Verification |
| --- | --- | --- | --- |
| Show agent names instead of identifiers in activity and comments, including old entries. | API complete; UI in progress | Lead and API agent | API regression reproduced; 26 integration tests pass. UI regression reproduces the missing name. |
| Center the ticket content within the main panel. Keep the text left aligned. | Integrated | Layout agent | Browser geometry passes at wide desktop and mobile widths. |
| Make Activity the first and default ticket tab. | Integrated | Layout agent | Browser test passes. |
| Rename Overview to Agent. Show only agent content in Agent. | Integrated | Layout agent | Browser test passes; shared ticket details remain above the tabs. |
| Remove red bars from ticket cards. | Integrated | Card agent | Bars indicated failing CI. Two board browser tests pass after removal. |
| Show a full interactive CLI, like Superset, wherever agent output appears. | In progress | Lead, transport agent, UI agent | User selected the full CLI. Requires PTY launch, input, resize, output replay, and live output. |
| Remove output polls and the last-30-message view. | In progress | Transport and UI agents | Replace snapshots with a push stream and retained terminal output. |
| Remove the manager queue from the manager page. | In progress | UI agent | Keep durable dispatch inside the host. Remove the page component and obsolete UI tests. |
| Use the actual process as the authority for agent status and metadata. Remove database state used to track process status. | In progress | Runtime agent and lead | Add live process inspection with PID identity checks. Replace server and page consumers. |
| Remove the agent-attempt dropdown. Show the CLI of the agent assigned to the ticket. | In progress | UI agent | Pending browser test. |
| Remove green dots next to agent avatars. | In progress | UI agent | Pending focused component and browser checks. |
| Update builder prompts. Remove name prefixes, routine logs, and evidence bookkeeping from comments. | Saved and verified | Lead | Removed the instruction that requests name prefixes. The builder persona now limits comments and requires checks before review. |
| Every harness start command includes its permission-bypass flag or equivalent. | In progress | Lead | Check each installed CLI's supported flags. Apply the same policy to resume commands. |
| Track all feedback in a Markdown file. Use subagents to fix and merge the work. | In progress | Lead | This file tracks each request. Merge and reinstall follow integration checks. |

## Completed foundation and earlier feedback

| Feedback | Status | Evidence or limit |
| --- | --- | --- |
| Investigate manager readiness, missing triggers, duplicate agents, and activity without results. | Addressed in native runtime work; status redesign continues above | Native process ownership, durable dispatch receipts, stable assignment IDs, and one active manager per project. |
| Learn from Superset and build a desktop host. Target macOS first, other platforms later. | Installed | Electron app and macOS background host. |
| Remove the Superset dependency and obsolete migration code. Manual one-time data handling is sufficient. | Installed | Native execution and selected local data home. |
| Let the desktop app use the existing data directory and provide native window controls. | Installed | Directory selection and macOS title bar. |
| Allow all tool permissions for the manager. | Installed | Project setting defaults to automatic approval and applies to pending requests. |
| Fix crashes and stuck runs caused by evidence file descriptor leaks. | Installed | Positional reads replace the leaking stream. Live repeated workspace scans retain zero workspace file descriptors. |
| Give the manager periodic heartbeats. Read and follow the manager prompt. | Installed | One idle minute; generation 50 acknowledged by Hana without a new process. |
| Keep manager comments useful. Send builder details directly, follow ticket scope, and avoid repeated blockers or questions. | Saved and verified after reinstall | Current manager persona updated at 15:54 UTC. |
| Do not repeat agent names and roles inside comments. | Manager and builder updated | The UI supplies the author name. |
| Rebuild, reinstall, and open the app after the changes. | Previous batch installed; current batch pending | Final installation waits for the terminal and status changes. |

## Completion checks

- Keep the same ticket data, worktrees, and conversation history.
- Test live terminal input, output replay, resize, disconnection, and process exit.
- Confirm heartbeat delivery with the interactive CLI.
- Confirm that process status comes from live process inspection.
- Run the focused tests and required integration checks for each change.
- Review and merge the complete diff.
- Rebuild, sign, reinstall, open, and verify the installed app.
