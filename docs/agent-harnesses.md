# Agent harness commands

Open **Project → Manager → Harness** to choose Claude, Codex, agy, OpenCode, pi, or custom commands.
The harness preset fills the start and resume commands.
Edit either command to change the executable, model, or flags.

Open **Project → Manager → ADE** to choose Superset, Terminal, tmux, or custom commands.
The ADE preset fills the commands that create and control agent sessions.
Terminal opens Terminal.app with a persistent tmux session on macOS.
Both Terminal and tmux require the `tmux` executable.
Each preset changes only its own settings.

**General** holds the persona, project directory, concurrency limit, and repositories.
Every command field saves on blur.
A single-line field also saves on Enter.
A multiline field also saves on Ctrl+Enter or Command+Enter.

## Agent commands

The default start command is `claude -n {{name}} --session-id {{sessionId}} {{prompt}}`.
The default manager resume command is `claude -n {{name}} --resume {{sessionId}} {{resumeText}}`.
`managerConfig.harness` holds `preset`, `startCommand`, and `resumeCommand`.
The Codex, agy, OpenCode, and pi presets resume the most recent conversation.
Set a specific conversation in the resume command when agents share a directory.
Trellis adds `TRELLIS_URL` and `TRELLIS_ACTOR` to the process environment.
A manager also starts in its configured project directory.

These fields accept `{{name}}`, `{{prompt}}`, `{{id}}`, `{{project}}`, `{{ticket}}`,
`{{actor}}`, `{{trellisUrl}}`, `{{workspaceId}}`, `{{terminalId}}`, `{{sessionId}}`,
`{{resumeText}}`, `{{directory}}`, and `{{instruction}}`.

## Session commands

The `managerConfig.adeCommands` object holds these templates.
Commands run on the Trellis server through `/bin/zsh`.
Use an SSH command or an ADE CLI to control a remote host.

| Field | Operation | Standard output on success |
|---|---|---|
| `start` | Start a new session | `{"workspaceId":"workspace","terminalId":"session"}` |
| `resume` | Resume a manager session | The same JSON shape as `start` |
| `healthcheck` | Check the agent when Refresh runs | `{"state":"running"}` or `{"state":"exited"}` |
| `send` | Send `{{text}}` as a follow-up | Unused |
| `output` | Read agent output | Plain text, including its line breaks |
| `stop` | Stop the agent session | Unused |
| `open` | Get the session link | A URL, or empty output for no link |
| `recover` | Find a session after an interrupted start | The same JSON shape as `start` |
| `projects` | Resolve `{{projectId}}` from the declared repositories | `[{"id":"project","repo":"https://github.com/owner/repo"}]` |

`workspaceId` and `terminalId` are nonempty strings that your ADE chooses.
They need no relationship to Superset.
Later commands receive these strings as template variables.
Trellis calls `projects` only when the start or resume template uses `{{projectId}}`.
Exactly one project must match a declared repository URL.

Exit with code 0 on success.
Write a failure reason to stderr and exit with a nonzero code.
An invalid result or a command error preserves the last known agent state during Refresh.
The run shows the error.
Trellis saves the output before it executes the stop command.

The healthcheck runs when a person or client requests Refresh.
It also checks a resumed manager for three seconds to detect a lost session.
These settings do not add a timer or an automatic wake.

## Session variables

| Variable | Value |
|---|---|
| `{{id}}` | Stable Trellis run ID |
| `{{sessionId}}` | Agent session ID |
| `{{resumeText}}` | Instructions for a manager after a pause |
| `{{name}}` | Agent name |
| `{{project}}` | Project reference |
| `{{ticket}}` | Ticket identifier, or empty for a manager |
| `{{branch}}` | Stable branch name for the run |
| `{{workDir}}` | Agent workspace path or the manager's configured directory |
| `{{projectDir}}` | Configured project directory |
| `{{runDir}}` | Directory that holds this run's files |
| `{{socket}}` | Private tmux socket for this Trellis data home |
| `{{workspaceId}}` | Workspace ID from the last successful start or recovery |
| `{{terminalId}}` | Session ID from the last successful start or recovery |
| `{{text}}` | Follow-up text |
| `{{prompt}}` | Persona instruction and assignment context |
| `{{agentCommand}}` | Expanded agent command, with the Trellis environment |
| `{{actor}}` | `agent:<run ID>` |
| `{{trellisUrl}}` | Trellis server URL |
| `{{superset}}` | Configured Superset executable path |
| `{{target}}` | Empty for this machine, or the configured Superset host flag |
| `{{createTarget}}` | `--local` for this machine, or the configured Superset host flag |
| `{{projectId}}` | Project ID from the `projects` result |
| `{{bun}}` | Bun executable path for the preset's JSON transforms |

Trellis quotes each variable as one shell argument.
Do not add quotes around a template variable.
The exceptions are `{{target}}` and `{{createTarget}}`, which expand to complete host flags.
An unknown variable prevents the save.

## Run configuration

Each command-backed run keeps a snapshot in `agents/<id>/harness.json`.
The snapshot includes its commands, host flags, and launch values.
Project edits affect the next start and preserve the commands of agents already at work.

A manager restart uses the current project configuration.
If the session start template or the agent start command changes, Trellis starts a new session.
Otherwise, it uses the resume commands and the existing workspace ID.
Trellis keeps the run ID and agent name in both cases.

Projects without `adeCommands` use their Superset or custom launch template.
A preset selection or ADE command edit saves a complete `adeCommands` object.
The API reads legacy `agentCommand`, `agentResumeCommand`, and `harnessCommands` fields and returns the separate harness and ADE settings.
The next settings save writes that structure.

A remote Superset host cannot use this machine's localhost address to reach Trellis.
Trellis rejects that combination before it creates a session.
Select **This machine**, or install Trellis with `--host` set to an address the remote host can reach.
