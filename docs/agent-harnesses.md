# Agent harnesses

Trellis runs Claude, Codex, OpenCode, pi, and Muse through its local host.
Each built-in harness has an interactive terminal.
The host reads native session events and checks the actual process.

Muse runs through its session protocol. The Trellis bridge starts one `muse serve` host per attempt, owns one session in it, and prints the transcript to the terminal.
Type a message into that terminal and press Enter to send it. Press Ctrl+C to interrupt the turn.
A message that arrives during a Muse turn waits in the bridge. When the turn ends, the next turn carries every waiting message at once, and each message gets its own receipt.
A Muse agent runs with the Muse sandbox disabled and every approval granted.
Trellis sets `MUSE_NO_AUTO_UPDATE=1` for every launch, so the Muse launcher does not replace its binary during a run. Update Muse by hand.
Muse reports the session and weekly windows of its login after each model call. Every Muse agent run saves the latest report, and the Usage page shows it on the Muse account card. A card with no run yet asks for one.

## Project settings

Open **Project → Settings → General** to set the repository directory.
A child project with an empty directory uses the nearest parent with a configured directory.
Trellis trusts configured directories and agent workspaces.

Select the harness, model, and effort when you assign an agent to a ticket.
Leave **Model** blank to use the harness default.
OpenCode and pi accept a `provider/model` identifier.
Muse accepts the Muse Spark models of the catalog, such as `meta/muse-spark-1.3`.
Changes apply to the next agent start.
Built-in harnesses bypass tool permission prompts.

A worker receives a separate Git worktree.
The host confirms the native session ID and submitted prompt before a built-in start succeeds.
A resume selects that exact native session ID.

## Terminal and process controls

The Agent tab shows the terminal for the ticket's assigned agent.
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
The hourly sweep removes the worktree when the run is closed, its ticket is done or canceled, and the worktree has no modified or untracked file. The branch stays in the repository.
The host rejects a follow-up while the agent works or has unsent terminal input.
A send succeeds after the harness confirms receipt.

The host supplies `TRELLIS_URL`, `TRELLIS_ACTOR`, and the selected host credentials to each agent.
Its `trellis` command targets the same host as the desktop app.

## Custom commands

Select **Custom** to edit the start and resume commands directly.
Custom commands run in a local terminal.
A native flow task requires a built-in harness with native session observations.

Command fields accept the variables from the [agent command contract](../packages/api/src/agentCommand/agentCommand.ts).
The Muse preset resumes with `muse --yolo resume --last`, because `muse resume` takes no prompt argument. Type the next instruction into the terminal after a custom Muse resume.
Use `{{prompt}}` for the initial assignment and `{{resumeText}}` for the next instruction.
Trellis quotes each variable as one shell argument.
Do not add quotes around a template variable.

## Verification

The [host test guide](desktop/host-testing.md) lists the isolated and real harness tests.
The [acceptance record](desktop/harness-acceptance.md) records verified versions and remaining limits.
