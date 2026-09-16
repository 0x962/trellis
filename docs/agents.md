# Agent setup

This guide covers two things. The first is the rules an agent follows when it
works a trellis ticket from another repository. The second is the personas and
the agent runs that trellis starts on its own.

## Actor header

Every non-GET request sends `x-trellis-actor: <human|agent>:<name>`.
The name uses printable ASCII, contains no colon, and has 1 to 64 characters.
An agent cannot use `system`. trellis reserves `system:trellis` for its own writes.
If an agent run has a session identifier, send it in `x-trellis-session`.

## Ticket completion

Agents and managers can move completed tickets to Done.
An agent never deletes tickets.

## Instructions for another repository

Paste this block into the `AGENTS.md` file of the other repository.

## Ticket workflow (trellis)

Tickets live in trellis, a local tracker at http://127.0.0.1:4521. Use the `trellis` CLI. When you pipe its output, it prints JSON.
Inside Claude Code, every command runs as `agent:claude-code`. Elsewhere, set `TRELLIS_ACTOR=agent:<name>`.

1. Pick work:        trellis list --project TRL --status todo
2. Read the ticket:  trellis show TRL-42 --comments
3. Start:            trellis move TRL-42 in-progress
4. Put the identifier in the branch name, for example TRL-42-dark-mode. If the title, branch, or body of a PR contains TRL-42, trellis links the PR. To link a PR by hand: trellis pr add TRL-42 <url>
5. Split work:       trellis sub TRL-42 -t "Write tests"
6. Ask a question:   trellis comment TRL-42 --body "..." and then wait for the reply: trellis watch --ticket TRL-42
7. Finish coding:    trellis move TRL-42 agent-review
8. When CI is green and the self-review is done: trellis move TRL-42 human-review
Never delete tickets.

Read a comment thread: trellis thread show <comment-id>
Reply in that thread: trellis comment TRL-42 --reply-to <comment-id> --body "..."
Resolve a thread: trellis thread resolve <comment-id>
Reopen a thread: trellis thread reopen <comment-id>

Chat room: every project has its own, with channels. #ai and #general exist in every room. Every live agent of the project receives each post; @<run id>, @<persona name>, or @manager sends a post to that agent only and interrupts its turn.
Read a channel: trellis chat read TRL ai
Post a message: trellis chat post TRL ai --body "..."
List channels:  trellis chat channels TRL
Create a channel for agents only: trellis chat create TRL <name> --ai-only
Attach a file:  trellis chat attach TRL <path>, then put the printed markdown in a post

Project notes: facts, current state, and decisions that every agent of the project reads at start. Write one when you learn something the next agent must know.
Read the notes: trellis notes list TRL
Write a note: trellis notes add TRL --title "..." --body "..."
Update or remove one: trellis notes edit <id> --body "..." / trellis notes rm <id>

PR review comments live in Trellis. Read them before work: trellis review list <pr-url>
Post a finding: trellis review add <pr-url> --path <file> --line <n> --body "..."
Reply: trellis review reply <thread-id> --body "..."
Resolve an addressed finding: trellis review resolve <thread-id>
Submit and notify selected agents: trellis review submit <pr-url> --threads <ids> --notify <agent-run-ids>
Use --no-notify when no agent needs a notification. Read unread reviews: trellis review inbox
Never post review findings as GitHub comments.

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

## Personas

A persona is a local record that trellis shares across every project. It holds a
name, an instruction, and one kind.

| Kind | Works on | Started from |
|---|---|---|
| builder | one ticket | the Agent section of the ticket rail, or `trellis agents start` |
| reviewer | one ticket | the same picker |
| manager | one project | the Manager page of the project |

Open the Personas page from the Personas link of the sidebar, at `/ai/personas`.
The cards group by kind. A slideout creates, edits, and deletes a record.

A name holds 1 to 120 characters and an instruction holds 1 to 200,000
characters. Neither may be blank. A create without a kind takes builder.

```sh
trellis personas list
trellis personas list --kind manager
trellis personas show "Careful reviewer"
```

`trellis personas show` prints the record, then the instruction below it.
A persona argument takes the persona id or its name, in any letter case.

## Agent runs

An agent run is one agent that trellis started from a persona. The run copies the
persona name, the kind, and the instruction at launch. A later edit of the
persona therefore changes only the runs after it, and a delete of the persona
keeps the copies.

```sh
trellis agents list
trellis agents list --ticket TRL-42
trellis agents start "Careful builder" --ticket TRL-42
trellis agents refresh <id>
trellis agents send <id> --text "Rebase on main, then push."
trellis agents output <id>
trellis agents stop <id>
```

`--text -` reads the follow-up from stdin.

A run carries one state.

| State | Meaning |
|---|---|
| starting | trellis asked the runner and holds no terminal yet |
| running | the terminal is up |
| interrupted | the launch reached the runner and the terminal is lost |
| failed | the launch did not reach the runner; `error` holds the reason |
| stopped | a person stopped the run |
| exited | the agent left its terminal |

`trellis agents start` exits 6 when the run answers in a state other than
`running`, and writes the reason to stderr.

### What a start refuses

- A persona kind that does not match the target. A manager takes `--project`. A builder and a reviewer take `--ticket`.
- A ticket that is already done or canceled.
- A project with no repository.
- A second live manager for the same project.
- A ticket start when the project already runs its concurrency limit of ticket agents. The limit runs from 1 to 64 and defaults to 3. The manager is outside that count.

A project keeps one manager. Its first start names it, and every later start
takes that same row, so the name holds. A manager that already has a Superset
workspace resumes: the start opens one more terminal in that workspace and
continues the chat the stop left behind. A start still reads the persona the
project names now, so a change of persona takes effect on the next start.

A sub-project can name its own manager persona in its project settings. Trellis asks for confirmation before it saves the first persona.
From then on the parent manager receives no events from that sub-project and starts no agents for its tickets. The sub-project's manager owns them.
The parent manager receives one event with a null ticket ID: `project.subproject_manager_enabled`, with the sub-project under `project`.
A cleared persona returns the sub-project to the parent manager and sends `project.subproject_manager_disabled`.
Persona, harness, and concurrency stay local to the sub-project. An empty directory uses the nearest configured ancestor directory.

Every agent setting of a project sits on its Manager page, at
`/p/<project path>/settings/manager`. The header holds one Play/Pause button. Play starts or resumes the manager. Pause stops its terminal. The Status section picks the manager persona and draws the
manager in the page: its state, its output, a follow-up box, and Stop. The ADE
section
picks the ADE, its command template, the Superset host, the concurrency limit,
and the project directory.

### The launch command

A project picks its Agentic Development Environment (ADE) in the ADE section of
its Manager page. `superset` opens a Superset workspace with the command template
of the machine. `custom` runs the command template of the project, and an empty
project template falls back to the machine template.

The machine template is `settings.agentLaunchCommand`. Its default is:

```
{{superset}} ws create {{target}} --project {{projectId}} --name {{name}} --branch {{branch}} --command {{agentCommand}} --json
```

The template takes these variables: `{{superset}}`, `{{target}}`, `{{workDir}}`,
`{{projectDir}}`, `{{concurrency}}`, `{{projectId}}`, `{{project}}`,
`{{ticket}}`, `{{name}}`, `{{branch}}`, `{{instruction}}`, `{{prompt}}`,
`{{actor}}`, `{{trellisUrl}}`, and `{{agentCommand}}`. An unknown variable fails
the save. Each value goes in as one quoted shell argument. `{{target}}` is the
Superset host flag of the project: `--local` for This machine, and
`--host '<id>'` for another machine.

A template that holds `{{superset}}` runs the agent in a Superset workspace. A
template without it runs the agent in a private tmux session, which survives a
restart of the trellis server.

`{{prompt}}` is the instruction of the persona, plus an assignment block with the
persona name, its actor, the trellis URL, the ticket or the project,
the concurrency limit, the project directory, and the repositories.
`{{agentCommand}}` wraps that prompt: it exports `TRELLIS_URL` and
`TRELLIS_ACTOR`, then runs `claude` with the persona name and the prompt. The actor
of a run is `agent:<run id>`.

The runner-driven agent manager takes the other path. Its command reads the
prompt from the server at start time, with
`trellis instructions --role manager|builder|reviewer`. Run that command yourself
to read what an agent of each role starts with:

```sh
trellis instructions --role builder --project TRL --ticket TRL-42
```

A manager prompt holds the status descriptions of the project, so
`--role manager` with `--project` reads them from the server.

CAUTION: The template is a shell command that the server runs as your account.
The server has no sign-in, so anyone who reaches the API sets that template.

## Chat rooms

Every project, a root or a sub-project, owns one chat room, and a sub-project
shares nothing with its parent. A manager talks to the agents of its own project.
`#ai` and `#general` exist in every room. A post to a new channel name creates the channel.
The `## Chat room` section of each persona instruction names the room, its commands, and its rules. The migration `0047_persona_chat_instructions` adds it to every saved persona. `docs/personas.json` holds a dump of the table.

```sh
trellis chat channels TRL
trellis chat read TRL ai
trellis chat read TRL ai --after <message-id>
trellis chat post TRL ai --body "@Builder the migration on main is merged."
trellis chat create TRL release
```

Write the channel name without the `#` in a shell, or quote it: a bare `#ai` starts a shell comment.
A channel created with `--ai-only` is for agents: a person reads it and cannot post in it, and the web raises no sound or unread dot for it. `#ai` is such a channel.
`trellis chat attach TRL <path>` uploads a file and prints the markdown line to put in a post.
Every live agent of the room's project receives each post, except its author.
A mention of `@<run id>`, `@<persona name>`, or a role such as `@manager`, `@builders`, or `@reviewers` sends the post to the mentioned agents only.
A mentioned agent is interrupted: Trellis stops its current turn and hands it the lines at once. An unmentioned agent reads the lines when its current turn ends.
A worker receives the pending lines in its terminal, batched into one message per controller tick.
A manager receives a `trellis.chat.messages` event with the same lines as data and posts through `trellis_chat_post`.
The web page at `/p/<project path>/chat` shows the log; `/join <name>` in its input creates a channel.
The page remembers the open channel and the unsent text per channel, marks a channel read while it is open in a visible tab, and shows a dot on unread channels and on the Chat link of the sidebar.
A new message from someone else plays a tone. Settings > Account > Chat sound switches it off for that browser.

## Project notes

A note is a titled markdown text on a project. Every agent of that project and of
its sub-projects reads the note at start: the launch prompt and `trellis brief` carry
a `## Project notes` section. A human or an agent writes a note for the agents that
come later: a fact about the repository or the machine, the current state of a
shared resource, or a decision that later work must respect.

```sh
trellis notes list TRL
trellis notes show <note-id>
trellis notes add TRL --title "Fresh worktree" --body "Run bun install before the first check."
trellis notes edit <note-id> --body "Free disk: 89 GiB at 16:45 UTC." --expires 2026-09-17T00:00:00Z
trellis notes rm <note-id>
```

The audience of a note is `all`, `manager`, or `worker`. A manager reads `all` and `manager`; a builder or a reviewer reads `all` and `worker`.
`--expires` marks a note about a passing state. An expired note leaves every read on its own, so nobody has to delete it.
Two notes of one project never share a title. A second `add` with the same title answers `DUPLICATE`; edit the note instead.
The web page at `/p/<project path>/notes` lists the notes of the project and its ancestors.
A manager writes and reads notes through the `trellis_notes_list`, `trellis_notes_get`, `trellis_notes_create`, `trellis_notes_update`, and `trellis_notes_delete` tools.

## Persona identity and mentions

Each agent uses its persona name as its label. Each persona has a stable shape and color.
Each assignment retains a separate internal ID. Its actor is `agent:<run id>`.
A ticket permits one active assignment per persona. Different personas can work on the same ticket.

Use `@Builder` in a ticket comment to notify its Builder assignment.
Use the manager persona name, such as `@Trellis`, to notify the project manager.
Persona names can contain spaces, such as `@Code separation`. Mentions ignore letter case.
The notification retains the assignment ID and session from the comment write.
An edit notifies only newly mentioned personas. Code spans and code blocks do not notify agents.
The comment shows whether the notification is queued, delivered, failed, or uncertain.

## Manager capacity waits

Record each notification outcome with `trellis manager handle` or the `trellis_controller_handle` tool.
For a ticket, `queued` without `waitFor` saves an action that waits for worker capacity. Put the intended next step in `reason`.
Use `blocked` with `waitFor` for the conditions below. A `blocked` outcome without `waitFor` records a receipt only.

When capacity opens, the manager receives the ticket in `workItems` and the saved action in `nextActions`.
Use its `assignmentRequestId` when you start the worker. That identifier retains the assignment across retries and manager replacement.
Record an outcome for each ticket in the notification. Use a null ticket ID for an empty heartbeat and for a project event.

```sh
trellis manager actions --project TRL --state waiting
trellis manager cancel-action ACTION_ID
```

The list accepts `--before ACTION_ID` for the next page.
A canceled action cannot start a worker. A new ticket decision can create a new action.
An assigned action identifies the reserved worker; inspect that worker to verify launch and task progress.
Existing historical `queued` outcomes remain receipts. The migration does not infer pending work from those records.

## Manager waits for time, dependencies, and responses

Add `waitFor` to a ticket's `blocked` or `queued` outcome:

| Condition | `waitFor` | Wake condition |
|---|---|---|
| Time | `{"type":"time","at":"2030-01-01T10:00:00-05:00"}` | The supplied time arrives. Use an explicit timezone. |
| Dependency | `{"type":"dependency","ticketId":"<ticket-id>"}` | The named ticket reaches a Done status. Canceled does not count as Done. |
| Human response | `{"type":"human_response","commentId":"<question-id>"}` | A human replies to the named root question on this ticket. |

For a quota wait, record the reset time from the provider in `at`. Put the provider, account, and intended action in `reason`.
The manager records this condition explicitly. Trellis does not infer reset times from provider error text.
Choose a dependency in the manager's scope. A ticket cannot depend on itself.
Create a root question for each human decision. Agent replies and comments on other threads do not satisfy this wait.
A reply that arrives before the manager records the wait still satisfies the question.
A human response prompts the manager to read the answer. It does not grant approval or change the ticket's status.

These conditions notify the manager even when worker capacity is full. A worker assignment still requires a free slot.
Each saved wait survives a restart and appears through `trellis manager actions` and `trellis_controller_actions`.
The manager receives its `waitFor` details in `nextActions`. Reuse its `assignmentRequestId` for the resulting worker assignment.
An outstanding condition blocks `agentRuns.start` even with a different request ID. Cancel the wait to withdraw that prerequisite.

If the condition changes, record the new `waitFor` in a later dispatch that includes the action.
Trellis cancels the previous action and gives the replacement a new assignment identifier.
A repeated outcome cannot change a handled dispatch. An unchanged condition does not send another notification on each controller tick.
Pause states hold the wait. Completed tickets, changed statuses, and changes to manager scope retire obsolete actions.
