## Ticket workflow (trellis)

Tickets live in trellis, a local tracker at http://127.0.0.1:4521. Use the `trellis` CLI. When you pipe its output, it prints JSON.
Inside Claude Code, every command runs as `agent:claude-code`. Elsewhere, set `TRELLIS_ACTOR=agent:<name>`.

1. Pick work:        trellis list --project KEY --status todo
2. Read the ticket:  trellis show KEY-42 --comments
3. Start:            trellis move KEY-42 in-progress
4. Put the identifier in the branch name, for example KEY-42-dark-mode. Link the PR to the ticket: trellis pr add KEY-42 <url>
5. Split work:       trellis sub KEY-42 -t "Write tests"
6. Ask a question:   trellis comment KEY-42 --body "..." and then wait for the reply: trellis watch --ticket KEY-42
7. Finish coding:    trellis move KEY-42 agent-review
8. When the agent review passes: trellis move KEY-42 human-review
Never delete tickets.

Labels say what a ticket is about. Read the set of the project: trellis labels list KEY
Put one on a ticket: trellis edit KEY-42 --add-label bug

Read a comment thread: trellis thread show <comment-id>
Reply in that thread: trellis comment KEY-42 --reply-to <comment-id> --body "..."
Resolve a thread: trellis thread resolve <comment-id>
Reopen a thread: trellis thread reopen <comment-id>

Project notes: facts, current state, and decisions that every agent of the project reads at start. Write one when you learn something the next agent must know.
Read the notes: trellis notes list KEY
Write a note: trellis notes add KEY --title "..." --body "..."
Update or remove one: trellis notes edit <id> --body "..." / trellis notes rm <id>

Plan an epic. A plan that produces several tickets is an epic. The epic description holds the plan: the goal, the fronts, the milestones, and the decisions for the person.
- A front is a line of work that one agent finishes with no result from another front: the server, the web, the CLI, the docs, a second repository. Make one ticket per front per milestone, and start its title with the front: "Server: the milestones table".
- A milestone holds the tickets that can all start at the same time. Order lives between milestones, never inside one. A ticket that needs the result of another ticket goes in a later milestone.
- After each set of parallel fronts, add a milestone that integrates them: one ticket that merges the branches, runs the type check, the linter, and the tests, and fixes what the merge broke.
- Keep the sequential steps of one front inside its ticket as sub-tickets, in order. A sub-ticket is a step of one agent, a ticket is a front, and a milestone is a point where the fronts meet.
- State in each ticket the files it owns, what it must not touch, the commands that verify it, and the result that the next milestone reads. Two tickets of one milestone never own the same file.
- File each decision for the person as a ticket in the human review status, in the first milestone that needs the answer, with the options and your recommendation.
- Keep a milestone to 2 to 8 tickets and an epic to 6 milestones. A larger plan is two epics.
- The person is the manager. The person starts the agents. Do not wait for a gate, and do not start the work of a later milestone on your own.
Create the epic: trellis epics create --project KEY --name "..." --description - < plan.md
Create each milestone in order: trellis milestones create KEY/<slug> --name "Foundation"
Create each ticket in its milestone: trellis create -p KEY --milestone KEY/<slug>/<milestone-slug> -t "Server: ..."
Read the epic, its milestones with their counts, and the tickets of each milestone: trellis epics show KEY/<slug>
When you work on a ticket of an epic, read the plan and the tickets of every milestone first: trellis brief KEY-42

PR review comments live in Trellis. Read them before work: trellis review list <pr-url>
Post a finding: trellis review add <pr-url> --path <file> --line <n> --body "..."
Reply: trellis review reply <thread-id> --body "..."
Resolve an addressed finding: trellis review resolve <thread-id>
Submit a GitHub review: trellis review submit <pr-url> --verdict <comment|approve|request_changes> --body "..."
Never post review findings as GitHub comments.

Without the CLI, use the HTTP API. It has the same actions. This call creates a ticket:
curl -X POST http://127.0.0.1:4521/api/tickets -H 'x-trellis-actor: agent:claude-code' -H 'Content-Type: application/json' -d '{"project":"KEY","title":"First"}'
The OpenAPI spec is at http://127.0.0.1:4521/api/openapi.json.
