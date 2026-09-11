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
8. When CI is green and the self-review is done: trellis move KEY-42 human-review
Never move a ticket to Done; a human does that. Never delete tickets.

Read a comment thread: trellis thread show <comment-id>
Reply in that thread: trellis comment KEY-42 --reply-to <comment-id> --body "..."
Resolve a thread: trellis thread resolve <comment-id>
Reopen a thread: trellis thread reopen <comment-id>

Without the CLI, use the HTTP API. It has the same actions. This call creates a ticket:
curl -X POST http://127.0.0.1:4521/api/tickets -H 'x-trellis-actor: agent:claude-code' -H 'Content-Type: application/json' -d '{"project":"KEY","title":"First"}'
The OpenAPI spec is at http://127.0.0.1:4521/api/openapi.json.
