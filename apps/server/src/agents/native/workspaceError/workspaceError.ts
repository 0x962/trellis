// The text a person reads when `git worktree add` fails while a native agent
// starts. Node builds its own message for a failed child process, which is the
// whole command line and then git's standard error. That message is stored in
// `agent_runs.error` and is shown in the agent panel and in a toast, so this
// sentence names the step that failed and keeps git's own words after it.
export const workspaceErrorText = (stderr: string) =>
	`Could not create the agent workspace with git worktree. ${stderr.trim()}`.trim();
