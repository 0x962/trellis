# Agent harnesses

Trellis runs Claude, Codex, OpenCode, and pi through its local host.
Each built-in harness has an interactive terminal.
The host reads native session events and checks the actual process.

## Project settings

Open **Project → Manager → General** to select the repository directory and persona.
Set the limit for concurrent active worker turns in the project. Idle workers keep their assignments without occupying slots.
A child project with an empty directory uses the nearest parent with a configured directory.
Trellis trusts configured directories and agent workspaces.

Open **Project → Manager → Harness** to select the harness and model.
Leave **Model** blank to use the harness default.
OpenCode and pi accept a `provider/model` identifier.
Changes apply to the next agent start.
Built-in harnesses bypass tool permission prompts.

A worker receives a separate Git worktree.
The manager uses the configured repository directory.
The host confirms the native session ID and submitted prompt before a built-in start succeeds.
A resume selects that exact native session ID.

## Terminal and process controls

The Agent tab shows the terminal for the ticket's assigned agent.
The manager page shows its terminal.
Native flow tasks provide a terminal action for their assigned attempt.
Terminal output streams to the page and remains available after a reconnect.

Use the CLI to control an assignment:

```sh
trellis agents list --project TRL --json
trellis agents start "Feature Builder" --ticket TRL-71
trellis agents send <agent-id> --text "Read the review findings."
trellis agents interrupt <agent-id>
trellis agents output <agent-id>
trellis agents stop <agent-id>
```

An interrupt ends the current turn and retains the conversation.
A stop ends the agent process and retains the worktree and output.
The host rejects a follow-up while the agent works or has unsent terminal input.
A send succeeds after the harness confirms receipt.

The host supplies `TRELLIS_URL`, `TRELLIS_ACTOR`, and the selected host credentials to each agent.
Its `trellis` command targets the same host as the desktop app.

## Custom commands

Select **Custom** to edit the start and resume commands directly.
Custom commands run in a local terminal.
Automatic dispatch and native flow tasks require a built-in harness with native session observations.

Command fields accept the variables from the [agent command contract](../packages/api/src/agentCommand/agentCommand.ts).
Use `{{prompt}}` for the initial assignment and `{{resumeText}}` for the next instruction.
Trellis quotes each variable as one shell argument.
Do not add quotes around a template variable.

## Verification

The [host test guide](desktop/host-testing.md) lists the isolated and real harness tests.
The [acceptance record](desktop/harness-acceptance.md) records verified versions and remaining limits.
