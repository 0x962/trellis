## Ticket workflow (trellis)

Tickets live in trellis, a local tracker at http://127.0.0.1:4521. Use the `trellis` CLI. When you pipe its output, it prints JSON.
Inside Claude Code, every command runs as `agent:claude-code`. Elsewhere, set `TRELLIS_ACTOR=agent:<name>`.

1. Pick work:        trellis list --project KEY --status todo
2. Read the ticket:  trellis show KEY-42 --comments
3. Start:            trellis move KEY-42 in-progress
4. Put the identifier in the branch name, for example KEY-42-dark-mode. If the title, branch, or body of a PR contains KEY-42, trellis links the PR. To link a PR by hand: trellis pr add KEY-42 <url>
5. Split work:       trellis sub KEY-42 -t "Write tests"
6. Ask a question:   trellis comment KEY-42 --body "..." and then wait for the reply: trellis watch --ticket KEY-42
7. Finish coding:    trellis move KEY-42 agent-review
8. When the agent review passes: trellis move KEY-42 human-review
Never delete tickets.

Read a comment thread: trellis thread show <comment-id>
Reply in that thread: trellis comment KEY-42 --reply-to <comment-id> --body "..."
Resolve a thread: trellis thread resolve <comment-id>
Reopen a thread: trellis thread reopen <comment-id>

Chat room: every project has its own, with channels. #ai and #general exist in every room. A post in #general with no mention reaches the manager only; a post elsewhere reaches every live agent. @<run id>, @<persona name>, or @manager sends a post to that agent only and interrupts its turn.
Read a channel: trellis chat read KEY ai
Post a message: trellis chat post KEY ai --body "..."
List channels:  trellis chat channels KEY
Create a channel for agents only: trellis chat create KEY <name> --ai-only
Attach a file:  trellis chat attach KEY <path>, then put the printed markdown in a post

Project notes: facts, current state, and decisions that every agent of the project reads at start. Write one when you learn something the next agent must know.
Read the notes: trellis notes list KEY
Write a note: trellis notes add KEY --title "..." --body "..."
Update or remove one: trellis notes edit <id> --body "..." / trellis notes rm <id>

PR review comments live in Trellis. Read them before work: trellis review list <pr-url>
Post a finding: trellis review add <pr-url> --path <file> --line <n> --body "..."
Reply: trellis review reply <thread-id> --body "..."
Resolve an addressed finding: trellis review resolve <thread-id>
Submit a GitHub review: trellis review submit <pr-url> --verdict <comment|approve|request_changes> --body "..."
Never post review findings as GitHub comments.

Without the CLI, use the HTTP API. It has the same actions. This call creates a ticket:
curl -X POST http://127.0.0.1:4521/api/tickets -H 'x-trellis-actor: agent:claude-code' -H 'Content-Type: application/json' -d '{"project":"KEY","title":"First"}'
The OpenAPI spec is at http://127.0.0.1:4521/api/openapi.json.
