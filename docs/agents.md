# Agent setup

## Actor header

Every non-GET request sends `x-trellis-actor: <human|agent>:<name>`.
The name uses printable ASCII, contains no colon, and has 1 to 64 characters.
An agent cannot use `system`. trellis reserves `system:trellis` for its own writes.
If an agent run has a session identifier, send it in `x-trellis-session`.

## Never Done

An agent moves finished work to `human-review`. An agent never moves a ticket to Done.
A human reviews the result and decides when the ticket moves to Done.
An agent never deletes tickets.

## Instructions for another repository

Paste this block into the `AGENTS.md` file of the other repository.

## Ticket workflow (trellis)

Tickets live in trellis, a local tracker at http://trellis.localhost. Use the `trellis` CLI. When you pipe its output, it prints JSON.
Inside Claude Code, every command runs as `agent:claude-code`. Elsewhere, set `TRELLIS_ACTOR=agent:<name>`.

1. Pick work:        trellis list --project TRL --status todo
2. Read the ticket:  trellis show TRL-42 --comments
3. Start:            trellis move TRL-42 in-progress
4. Put the identifier in the branch name, for example TRL-42-dark-mode. If the title, branch, or body of a PR contains TRL-42, trellis links the PR. To link a PR by hand: trellis pr add TRL-42 <url>
5. Split work:       trellis sub TRL-42 -t "Write tests"
6. Ask a question:   trellis comment TRL-42 --body "..." and then wait for the reply: trellis watch --ticket TRL-42
7. Finish coding:    trellis move TRL-42 agent-review
8. When CI is green and the self-review is done: trellis move TRL-42 human-review
Never move a ticket to Done; a human does that. Never delete tickets.

A watch line carries the change itself. A comment line holds the ticket, the author, and the text, so you read a reply without another call. A line with `bodyTruncated` true holds the first 2000 characters of the comment; read the rest with `trellis thread show <comment-id>`.

Read a comment thread: trellis thread show <comment-id>
Reply in that thread: trellis comment TRL-42 --reply-to <comment-id> --body "..."
Resolve a thread: trellis thread resolve <comment-id>
Reopen a thread: trellis thread reopen <comment-id>

Without the CLI, use the HTTP API. It has the same actions. This call creates a ticket:
curl -X POST http://127.0.0.1:4521/api/tickets -H 'x-trellis-actor: agent:claude-code' -H 'Content-Type: application/json' -d '{"project":"TRL","title":"First"}'
The OpenAPI spec is at http://127.0.0.1:4521/api/openapi.json.

## Comment threads

Use the comment ID from `trellis comments TRL-42` to read or reply to a thread.

```sh
trellis thread show <comment-id>
trellis comment TRL-42 --reply-to <comment-id> --body "I checked this."
trellis thread resolve <comment-id>
trellis thread reopen <comment-id>
```

A reply to a reply joins the same thread. A thread read includes the root comment and every reply.
The server refuses to delete a root comment while replies exist.
