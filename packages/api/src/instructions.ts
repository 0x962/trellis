// The AGENTS.md block `trellis instructions` prints and the web offers to
// copy. `key` is the project key an agent works in.
export const instructions = (key: string) => `## Ticket workflow (trellis)

Tickets live in trellis, a local tracker at http://127.0.0.1:4521. Use the \`trellis\` CLI. When you pipe its output, it prints JSON.
Inside Claude Code, every command runs as \`agent:claude-code\`. Elsewhere, set \`TRELLIS_ACTOR=agent:<name>\`.

1. Pick work:        trellis list --project ${key} --status todo
2. Read the ticket:  trellis show ${key}-42 --comments
3. Start:            trellis move ${key}-42 in-progress
4. Put the identifier in the branch name, for example ${key}-42-dark-mode. If the title, branch, or body of a PR contains ${key}-42, trellis links the PR. To link a PR by hand: trellis pr add ${key}-42 <url>
5. Split work:       trellis sub ${key}-42 -t "Write tests"
6. Ask a question:   trellis comment ${key}-42 --body "..." and then wait for the reply: trellis watch --ticket ${key}-42
7. Finish coding:    trellis move ${key}-42 agent-review
8. When CI is green and the self-review is done: trellis move ${key}-42 human-review
Never delete tickets.

Read a comment thread: trellis thread show <comment-id>
Reply in that thread: trellis comment ${key}-42 --reply-to <comment-id> --body "..."
Resolve a thread: trellis thread resolve <comment-id>
Reopen a thread: trellis thread reopen <comment-id>

Chat room: every project tree has one, with channels. #ai and #general exist in every room. Every live agent receives each post; @<run id>, @<persona name>, or @manager sends a post to that agent only and interrupts its turn.
Read a channel: trellis chat read ${key} ai
Post a message: trellis chat post ${key} ai --body "..."
List channels:  trellis chat channels ${key}
Create a channel for agents only: trellis chat create ${key} <name> --ai-only
Attach a file:  trellis chat attach ${key} <path>, then put the printed markdown in a post

Project notes: facts, current state, and decisions that every agent of the project reads at start. Write one when you learn something the next agent must know.
Read the notes: trellis notes list ${key}
Write a note: trellis notes add ${key} --title "..." --body "..."
Update or remove one: trellis notes edit <id> --body "..." / trellis notes rm <id>

PR review comments live in Trellis. Read them before work: trellis review list <pr-url>
Post a finding: trellis review add <pr-url> --path <file> --line <n> --body "..."
Reply: trellis review reply <thread-id> --body "..."
Resolve an addressed finding: trellis review resolve <thread-id>
Submit and notify selected agents: trellis review submit <pr-url> --threads <ids> --notify <agent-run-ids>
Use --no-notify when no agent needs a notification. Read unread reviews: trellis review inbox
Never post review findings as GitHub comments.

Without the CLI, use the HTTP API. It has the same actions. This call creates a ticket:
curl -X POST http://127.0.0.1:4521/api/tickets -H 'x-trellis-actor: agent:claude-code' -H 'Content-Type: application/json' -d '{"project":"${key}","title":"First"}'
The OpenAPI spec is at http://127.0.0.1:4521/api/openapi.json.
`;
