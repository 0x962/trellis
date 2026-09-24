# Agents

Trellis is a coding platform where users organize projects and assign work to agents.
It starts local agents for tickets, flow steps, and sessions.
Every agent uses `agent:<run id>` as its actor.

## Shared guide

Every start and resume receives the [shared Trellis guide](../packages/api/src/agentGuide/template.md).
The same source supplies `trellis guide show`.
The server fills its context fields from current records at launch.

The guide contains:

- Trellis concepts and the user context that Trellis has
- the CLI reference, command examples, output rules, and exit codes
- the project, repositories, resources, configured statuses, and project notes
- the current epic, other epics, current wave, and other waves
- the assigned ticket, its peers, and full ticket context
- rules for diffs, resources, sub-agents, messages, and documents

A session without a project receives the common guide and its session request.
Its project and ticket fields show that no assignment exists.
Project-specific instructions belong in project records and repository files.
The built-in guide uses the statuses configured for each project.

## Ticket assignments

A ticket has zero or one assigned agent.
The assignment stores its harness, model, effort, account, workspace, and provider conversation.
A status change does not change or remove the assignment.
The assignment remains after its process exits.
A person removes the assignment before another agent takes the ticket.

The Agent section of the ticket rail selects the harness, model, and effort.
The CLI provides the same operations:

```sh
trellis agent list --ticket DEMO-42
trellis agent start --ticket DEMO-42 --harness codex
trellis agent refresh <id>
trellis agent send <id> --text "Rebase on main, then push."
trellis agent output <id>
trellis agent stop <id>
```

`trellis agent start` exits with code 6 when the new process is not active.
The command writes the process error to standard error.

| State | Meaning |
|---|---|
| `starting` | Trellis reserved the assignment but has no process yet. |
| `running` | The process is active. |
| `interrupted` | The runtime lost the process record. |
| `failed` | The launch failed. |
| `stopped` | A person stopped the process. |
| `exited` | The agent process exited. |

## Flows

A flow is a graph of agents with defined responsibilities and paths between their steps.
Flows often review diffs.
Flow nodes store their own instructions.
Each flow agent receives the common guide, its assigned step, and prior step outputs.
A flow execution freezes its graph when it starts.
Later edits do not change that execution.

`trellis flow start <flow> --diff <diff>` returns the latest existing run for that flow and diff.
If the latest run ended with an execution error, it starts a new run.
Review findings, negative decisions, and human rejections are feedback.
Feedback does not permit an automatic repeated start.
An explicit user instruction permits `--allow-repeat --reason <text>`.
The Run again control in the app records that user choice.

## Launch and resource use

Trellis creates a Git worktree for a ticket assignment.
The local runtime owns the process and keeps its output across a host restart.
A resume keeps the compatible provider conversation and workspace.
The refreshed guide does not reset the conversation.
A custom harness command must include `{{prompt}}`, `{{instruction}}`, or `{{resumeText}}` to receive the guide.

The launch supplies these environment variables:

- `TRELLIS_URL`
- `TRELLIS_ACTOR`
- `TRELLIS_RUN_ID`
- `TRELLIS_ATTEMPT_ID`
- `TRELLIS_ATTEMPT_TOKEN`

The guide asks agents to use CI for broad checks and targeted local tests for their changes.
These instructions do not block shell commands.
CI results can resume an idle-expired agent in its existing conversation.
A result does not resume a process that a person stopped.

The server sweeps worktrees at boot and once an hour.
It can remove a clean worktree for a done or canceled ticket when the assigned process has exited.
It preserves worktrees for active tickets, live processes, sessions, open files, and uncommitted work.
A launch and a sweep of the same workspace cannot run at the same time.
The sweep retains the branch, ticket assignment, and provider conversation.

## Project notes

Project notes carry long-lived context for agents.
An agent receives active notes with the `all` or `worker` audience.

```sh
trellis project note list DEMO
trellis project note add DEMO --title "Release state" --body "The release is paused."
trellis project note edit <id> --body "The release can continue."
trellis project note rm <id>
```

Complete the assigned work before you change a ticket status.
Record concrete blockers in the ticket.
Use the statuses configured for that project.
