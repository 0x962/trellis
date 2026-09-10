# Agent setup

## Actor header

Every non-GET request sends `x-trellis-actor: <human|agent>:<name>`.
The name uses printable ASCII, contains no colon, and has 1 to 64 characters.
Agents cannot use `system`. trellis reserves `system:trellis` for internal work.
Send `x-trellis-session` when an agent run has a session identifier.

## Never Done

An agent moves ready work to `human-review` and never moves work to Done.
A human reviews the result and decides when the ticket reaches Done.
An agent never deletes tickets.

## Instructions for another repository

Paste the following block into the other repository's `AGENTS.md` file.

## Ticket workflow (trellis)

Tickets live in trellis, a local tracker at http://trellis.localhost. Use the `trellis` CLI. It prints JSON when piped.
Identify yourself: inside Claude Code every command runs as `agent:claude-code`. Elsewhere set `TRELLIS_ACTOR=agent:<name>`.

1. Pick work:        trellis list --project TRL --status todo
2. Read the ticket:  trellis show TRL-42 --comments
3. Start:            trellis move TRL-42 in-progress
4. Put the identifier in the branch name, for example TRL-42-dark-mode. A PR whose title, branch, or body carries TRL-42 links itself. To link one by hand: trellis pr add TRL-42 <url>
5. Split work:       trellis sub TRL-42 -t "Write tests"
6. Ask a question:   trellis comment TRL-42 --body "..." and then wait for the reply: trellis watch --ticket TRL-42
7. Finish coding:    trellis move TRL-42 agent-review
8. When CI is green and the self-review is done: trellis move TRL-42 human-review
Never move a ticket to Done; a human does that. Never delete tickets.

Without the CLI, the HTTP API takes the same actions. One call creates a ticket:
curl -X POST http://127.0.0.1:4521/api/tickets -H 'x-trellis-actor: agent:claude-code' -H 'Content-Type: application/json' -d '{"project":"TRL","title":"First"}'
The OpenAPI spec is at http://127.0.0.1:4521/api/openapi.json.
