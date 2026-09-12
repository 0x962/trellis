# Agent setup

This guide covers two things. The first is the rules an agent follows when it
works a trellis ticket from another repository. The second is the personas and
the agent runs that trellis starts on its own.

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
Never move a ticket to Done; a human does that. Never delete tickets.

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

## Personas

A persona is a local record that trellis shares across every project. It holds a
name, an instruction, and one kind.

| Kind | Works on | Started from |
|---|---|---|
| builder | one ticket | the Agent section of the ticket rail, or `trellis agents start` |
| reviewer | one ticket | the same picker |
| manager | one project | the Manager page of the project |

Open the Personas page from the AI section of the sidebar, at `/ai/personas`.
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

Set the persona, the concurrency, and the project directory of a project on its
Manager page, at `/p/<project path>/settings/manager`.

### The launch command

The Agents section of the settings holds one command template for every agent.
The default is:

```
{{superset}} ws create --local --project {{projectId}} --name {{name}} --branch {{branch}} --command {{agentCommand}} --json
```

The template takes these variables: `{{superset}}`, `{{workDir}}`,
`{{projectDir}}`, `{{concurrency}}`, `{{projectId}}`, `{{project}}`,
`{{ticket}}`, `{{name}}`, `{{branch}}`, `{{instruction}}`, `{{prompt}}`,
`{{actor}}`, `{{trellisUrl}}`, and `{{agentCommand}}`. An unknown variable fails
the save. Each value goes in as one quoted shell argument.

A template that holds `{{superset}}` runs the agent in a Superset workspace. A
template without it runs the agent in a private tmux session, which survives a
restart of the trellis server.

`{{prompt}}` is the instruction of the persona, plus an assignment block with the
agent name, its actor, the trellis URL, the persona, the ticket or the project,
the concurrency limit, the project directory, and the repositories.
`{{agentCommand}}` wraps that prompt: it exports `TRELLIS_URL` and
`TRELLIS_ACTOR`, then runs `claude` with the agent name and the prompt. The actor
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
