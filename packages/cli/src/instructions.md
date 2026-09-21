## Ticket workflow (trellis)

Tickets live in trellis, a local tracker at http://127.0.0.1:4521. Use the `trellis` CLI. When you pipe its output, it prints JSON.
Inside Claude Code, every command runs as `agent:claude-code`. Elsewhere, set `TRELLIS_ACTOR=agent:<name>`.

1. Pick work:        trellis list --project KEY --status todo
2. Read the ticket:  trellis brief KEY-42
3. Start:            trellis move KEY-42 in-progress
4. Put the identifier in the branch name, for example KEY-42-dark-mode. Link the PR to the ticket: trellis pr add KEY-42 <url>
5. Split work:       trellis sub KEY-42 -t "Write tests"
6. Ask a question:   trellis create -p KEY --status human-review -t "..." --description - with a numbered "Options:" list,
   then trellis edit KEY-42 --after <question>. The answer reaches your run.
7. Finish coding:    trellis move KEY-42 agent-review
8. When the agent review passes: trellis move KEY-42 human-review
Report what you did in your final message and in the pull request description.
Never delete tickets.

Prove the change. A pull request without its evidence is not reviewable.

1. Read the contract:  trellis contract show KEY-42
   It names the files, the files to leave alone, the verify commands, the review focus and the evidence owed.
2. Record each dependency as an edge, never as prose:  trellis edit KEY-43 --after KEY-42
3. Write the summary:  trellis summary write <pr> --headline "..." --why - --watch "..."
   Write a simple, direct explanation of what changed and why, in plain words.
   Say what was wrong or missing.
   Say what changes for the person who uses the product.
   Say how the pull request works in two or three direct sentences.
   Use real names such as webhook, API, migration, and the page name.
   Do not replace technical terms with childish words, metaphors, or analogies.
   Avoid jargon only where a plain word says the same thing.
   Avoid internal code names, file paths, and function names unless they are the point.
   Write the headline as one sentence a person would say out loud.
   The watch line names one file and the reason to open it first, or says "nothing".
   Never write the size, the risk or the check counts. Trellis computes them and ignores yours.
   Rewrite the summary after every push.
4. When the change renders a screen, attach:
   the after image of each route, at 1440x900, dark; the before image of the same route from the merge base,
   same viewport, theme and seed; the capture record with both shas, the route, the viewport, the theme, the seed
   command and the browser; the console error list and the failed request list; a clip of 15 s or less when the
   change touches motion, a gesture, scroll, timing, or a task of more than one step.
   Capture in your own worktree, on your own port, with animations off. Register each file with
   trellis evidence add <pr> --kind before|after|capture|clip|console.
5. When the change renders no screen, attach:
   the verify record of each Verify command, with the exit code, the tail and the head sha; each new test by name,
   with the base sha where it fails and the head sha where it passes; the contract table, before and after, or
   "no contract changed"; the migration plan when a schema changes; one picture, and one only, when the call path
   crosses a process, a service or a trust boundary, or when a state machine changes. Write it in Mermaid.
   Register each record with
   trellis evidence add <pr> --kind verify|test|contract|migration|picture.
6. Bind every sentence to something checkable: a file and a line, a check result, a test name, or a number with
   its sha. Say when a sentence is a guess.
7. Check yourself:  trellis evidence check <pr>
   Hand over:        trellis move KEY-42 human-review

Labels say what a ticket is about. Read the set of the project: trellis labels list KEY
Put one on a ticket: trellis edit KEY-42 --add-label bug

Project notes: facts, current state, and decisions that every agent of the project reads at start. Write one when you learn something the next agent must know.
Read the notes: trellis notes list KEY
Write a note: trellis notes add KEY --title "..." --body "..."
Update or remove one: trellis notes edit <id> --body "..." / trellis notes rm <id>

Plan an epic. A plan that produces several tickets is an epic. The epic description holds the goal, the fronts, the waves, and the questions for the person.
- A front is work that one agent finishes with no result from another front. Make one ticket per front per wave. Start its title with the front.
- A wave holds the tickets that you intend to start together. A wave gates nothing.
- Record order with `--after`. Each ticket that needs another ticket records `--after` on that ticket.
- After each set of parallel fronts, add a wave that integrates them. One ticket merges the branches and runs all checks.
- Keep the sequential steps of one front inside its ticket as ordered sub-tickets.
- Each ticket states its files, the files to leave alone, the verify commands, the review focus, and the evidence owed.
- Two tickets in one wave never own the same file.
- A question for the person is a ticket in the human review status. Every ticket that needs the answer records `--after` on it.
- An answer reaches each live run that waits on the question.
- Keep a wave to 2 to 8 tickets and an epic to 6 waves. A larger plan is two epics.
- The person is the manager. The person starts the agents. Do not wait for a gate.
- Frontend evidence floor: summary, after image, before image, capture record, console list.
- Backend evidence floor: summary, verify record, test proof, contract table.
- Read the full evidence rules in `docs/EVIDENCE.md`.
Create the epic: trellis epics create --project KEY --name "..." --description - < plan.md
Create each wave in order: trellis waves create KEY/<epic-slug> --name "Foundation"
Create each ticket in its wave: trellis create -p KEY --wave KEY/<epic-slug>/<wave-slug> -t "Server: ..."
Read the epic, its waves with their counts, the tickets of each wave, and what is next: trellis epics show KEY/<epic-slug>
When you work on an epic ticket, read the plan and the results of the earlier waves first: trellis brief KEY-42

PR review comments live in Trellis. Read them before work: trellis review list <pr-url>
Post a finding: trellis review add <pr-url> --path <file> --line <n> --body "..."
Reply: trellis review reply <thread-id> --body "..."
Resolve an addressed finding: trellis review resolve <thread-id>
Save a local verdict and deliver it to the agent: trellis review submit <pr-url> --verdict <comment|approve|request_changes> --body "..."
Never post review findings as GitHub comments.

Without the CLI, use the HTTP API. It has the same actions. This call creates a ticket:
curl -X POST http://127.0.0.1:4521/api/tickets -H 'x-trellis-actor: agent:claude-code' -H 'Content-Type: application/json' -d '{"project":"KEY","title":"First"}'
The OpenAPI spec is at http://127.0.0.1:4521/api/openapi.json.
