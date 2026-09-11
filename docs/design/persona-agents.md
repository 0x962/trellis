# Agents from personas

A persona defines a role. An agent is one named run of that persona for a ticket or a project.
Navid owns the local data and the code these agents change.

## Outcomes

1. A ticket offers New agent. The slideout requires a builder or reviewer persona.
2. Start creates a random agent name and launches the configured command with the persona instruction and ticket context.
3. A manager uses the same start path with a manager persona and a project.
4. Each run keeps a snapshot of the persona name, kind, and instruction. Persona edits affect subsequent runs.
5. A second active run for the same ticket, or a second manager for the same project, is rejected before launch.
6. A failed launch stays visible with its error. The user can start another agent after the failure.
7. Stop closes the run's terminal and retains its workspace and history.
8. Refresh checks the terminal and marks a run exited when its terminal stops.
9. The Agents page shows cards grouped by kind. Each card links to its workspace and identifies its ticket or project.
10. Persona deletion retains the snapshots of previous runs.
11. Trellis uses the project's declared repository, including inherited repositories, to select its Superset project.

12. Settings edits the launch-command template in a slideout. The default uses Superset.
13. Template values are quoted as single shell arguments. An unknown variable prevents a save.
14. A custom command runs in a private tmux session. The session survives a Trellis restart.
15. The agent slideout shows terminal output and accepts follow-up messages.
16. Stop preserves the final terminal output. The run keeps its runtime when the launch setting changes.

## Launch command

`{{superset}}` selects the Superset adapter. Its command must return the workspace and command terminal as Superset JSON.
Other templates start a managed terminal and require `tmux` on PATH.
Custom commands run in `{{workDir}}`, a private directory under the Trellis data home.
Use `cd` in a custom command to select a checkout. Trellis exports `TRELLIS_URL` and `TRELLIS_ACTOR` to the process.
`{{prompt}}` includes the persona and assignment. `{{instruction}}` contains the persona instruction alone.
`{{name}}`, `{{actor}}`, `{{ticket}}`, `{{project}}`, `{{branch}}`, and `{{trellisUrl}}` identify the assignment.
`{{projectId}}` identifies the matching Superset project. `{{agentCommand}}` starts the default agent with the prompt.

The API exposes these operations under `agentRuns` at `/agent-runs`.
The retired agent-session API remains retired.
