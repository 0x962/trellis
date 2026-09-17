# Agents

Trellis starts local agents for tickets, project management, flows, and scratch sessions.
Every agent uses `agent:<run id>` as its actor.

Run this command to print the repository instructions:

```sh
trellis instructions --project TRL
```

Add the output to the repository `AGENTS.md` file.

## Ticket assignments

A ticket has zero or one assigned agent.
The assignment stores its harness, model, effort, account, workspace, and provider conversation.
A status change does not change or remove the assignment.
The assignment remains after its process exits.
Remove the assignment before you assign another agent.

Use the Agent section of the ticket rail to assign the agent.
The dialog selects the harness, model, and effort.

The CLI provides the same operations:

```sh
trellis agents list --ticket TRL-42
trellis agents start --ticket TRL-42 --harness codex --model openai/gpt-5.6-sol --effort high
trellis agents refresh <id>
trellis agents send <id> --text "Rebase on main, then push."
trellis agents output <id>
trellis agents stop <id>
```

`trellis agents start` exits with code 6 when the new process is not running.
The command writes the process error to standard error.

An agent run has one state:

| State | Meaning |
|---|---|
| `starting` | Trellis reserved the assignment but has no process yet. |
| `running` | The process is active. |
| `interrupted` | The runtime lost the process record. |
| `failed` | The launch failed. |
| `stopped` | A person stopped the process. |
| `exited` | The agent process exited. |

## Project managers

Project settings store the manager instruction directly.
The same settings store the repository directory, harness, model, effort, and account.
A child project with its own manager instruction has its own manager scope.
An empty instruction makes the child project part of its nearest managed ancestor.

The manager keeps one run and one provider conversation across restarts.
An explicit new-session request replaces that conversation.

## Flows

A flow stores its prompt in each agent, gate, or loop node.
The flow briefing precedes the node prompt at run time.
Prior step outputs follow the node prompt.

A flow execution freezes its graph when it starts.
Later edits do not change an active or completed execution.

## Launch context

Trellis creates a Git worktree for a ticket assignment.
The local runtime owns the process and keeps its output across a host restart.
The launch supplies these environment variables:

- `TRELLIS_URL`
- `TRELLIS_ACTOR`
- `TRELLIS_RUN_ID`
- `TRELLIS_ATTEMPT_ID`
- `TRELLIS_ATTEMPT_TOKEN`

The prompt includes the saved instruction, ticket or project context, repository instructions, and active project notes.

## Chat

Each project has its own chat room.
The `#ai` and `#general` channels exist in every room.
A human post without a mention reaches every live agent in a shared channel.
An agent post without a mention reaches every other live agent.

Use a run ID, an agent name, or a role to address specific agents:

```text
@01K... check the migration
@Agent re-run the test
@manager review the blocker
@agents report status
```

Code spans and code blocks do not create mentions.
An edit notifies only newly mentioned agents.

## Notes

Project notes carry long-lived context for agents.
The audience is `all`, `manager`, or `worker`.
A manager reads `all` and `manager` notes.
A ticket or flow agent reads `all` and `worker` notes.

```sh
trellis notes list TRL
trellis notes add TRL --title "Release state" --body "The release is paused."
trellis notes edit <id> --body "The release can continue."
trellis notes rm <id>
```

## Completion

Complete the assigned work before you move a ticket.
Record concrete blockers in the ticket.
Do not treat a process exit as an assignment change.
