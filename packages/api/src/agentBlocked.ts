import type { AgentBlocked } from "./schemas/agent.ts";

// One sentence about a blocked agent, and one about what to do. The CLI
// and the web read the same words, so a person who moves between them
// reads one wording for one state.

// What stops the agent. `title` is the agent's tab name, such as "CDE-42".
export const blockedLine = (title: string, blocked: AgentBlocked): string => {
	switch (blocked.reason) {
		case "folder-trust":
			return `${title} waits at the folder trust question of its agent command line.`;
		case "runner-error":
			return `trellis cannot start ${title}. ${blocked.detail ?? "The runner gave no reason."}`;
		case "terminal-exited":
			return `The terminal of ${title} is gone, so the agent stopped.`;
		default:
			return `${title} started and never reported itself, so it waits at a question.`;
	}
};

// What a person does about it. A `folder-trust` block that names a folder
// clears with one action, so the text names that folder.
export const blockedAction = (blocked: AgentBlocked): string => {
	switch (blocked.reason) {
		case "folder-trust":
			return blocked.path === null
				? "Add a trusted folder to the project, then start the agent again."
				: `Trust ${blocked.path}, then start the agent again.`;
		case "runner-error":
			return "Fix the runner, then start the agent again.";
		default:
			return "Start the agent again.";
	}
};
