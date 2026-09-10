import { ORPCError } from "@orpc/server";
import { type AgentFailure, errors, type RunnerProject, type RunnerReason } from "@trellis/api";

// The program that starts, finds, wakes, and stops agents. Superset is the
// only runner. Every id a runner hands back is opaque to trellis: the server
// stores it and gives it back unchanged.

// One repository a trellis project declares, lowercase.
export type RunnerRepo = { owner: string; repo: string };

// Superset records a project's repository as a URL or as `owner/repo`, in
// any letter case, with or without `.git`.
const namesRepo = (recorded: string, { owner, repo }: RunnerRepo) => {
	const plain = recorded
		.toLowerCase()
		.replace(/\.git$/, "")
		.replace(/\/+$/, "");
	const wanted = `${owner}/${repo}`;
	return plain === wanted || plain.endsWith(`/${wanted}`) || plain.endsWith(`:${wanted}`);
};

// The id of the runner project that holds the first of `repos` that any
// runner project holds, or null. `repos` comes nearest project first, so a
// sub-project's own repo wins over its parent's.
export const matchRunnerProject = (projects: RunnerProject[], repos: RunnerRepo[]): string | null => {
	for (const repo of repos) {
		const found = projects.find((project) => project.repo !== null && namesRepo(project.repo, repo));
		if (found !== undefined) return found.id;
	}
	return null;
};

// A running agent's place in the runner. `openUrl` is the deep link that
// opens its workspace.
export type AgentPlace = { workspaceId: string; terminalId: string; openUrl: string };

export type TerminalRef = { workspaceId: string; terminalId: string };

export type TerminalState = { terminalId: string; exited: boolean; title: string };

// `project` is the trellis project path, such as "CDE". `claudeSessionId`
// is the Claude session a manager registered; the runner resumes it when
// the manager exited, with `text` as the next prompt.
export type ManagerStart = {
	project: string;
	runnerProjectId: string;
	baseBranch: string;
	claudeSessionId: string | null;
	text?: string;
};

export type BuilderStart = {
	project: string;
	runnerProjectId: string;
	baseBranch: string;
	ticket: string;
	title: string;
};

export type ReviewerStart = { project: string; ticket: string; prUrl: string; workspaceId: string };

export type ManagerSession = TerminalRef & { project: string; claudeSessionId: string | null };

export type Runner = {
	// The runner project that holds one of `repos`, in the order given.
	// Every project the runner knows, for the settings page picker.
	projects: () => Promise<RunnerProject[]>;
	projectFor: (repos: RunnerRepo[]) => Promise<string>;
	// `started` is false when a live manager tab already ran in the workspace.
	ensureManager: (input: ManagerStart) => Promise<AgentPlace & { started: boolean }>;
	startBuilder: (input: BuilderStart) => Promise<AgentPlace>;
	startReviewer: (input: ReviewerStart) => Promise<{ terminalId: string }>;
	// Types `text` into the manager's terminal. A manager whose terminal
	// exited or closed starts again in a new terminal; `relaunched` is then
	// true and `terminalId` names the new terminal.
	wake: (session: ManagerSession, text: string) => Promise<{ terminalId: string; relaunched: boolean }>;
	isAlive: (ref: TerminalRef) => Promise<boolean>;
	terminals: (workspaceId: string) => Promise<TerminalState[]>;
	// True when the checkout of `project` holds `branch`. A workspace starts
	// from the base branch, so a branch the checkout lacks stops the start.
	hasBranch: (project: RunnerProject, branch: string) => Promise<boolean>;
	stop: (ref: TerminalRef) => Promise<void>;
	removeWorkspace: (workspaceId: string) => Promise<void>;
	openUrl: (workspaceId: string) => Promise<string>;
};

// The declared RUNNER_UNAVAILABLE error. `detail` is what the runner
// printed, appended to the message so the person who asked reads why, and
// carried whole in the payload so trellis can store it. `exitCode` is what
// the runner process returned; a start that never ran a process has none.
export const runnerUnavailable = (reason: RunnerReason, detail = "", exitCode: number | null = null) => {
	const base = errors.RUNNER_UNAVAILABLE.message;
	return new ORPCError("RUNNER_UNAVAILABLE", {
		defined: true,
		status: errors.RUNNER_UNAVAILABLE.status,
		message: detail === "" ? base : `${base} ${detail}`,
		data: { reason, exitCode, detail },
	});
};

// The payload of a RUNNER_UNAVAILABLE error, for the caller that stores it
// on the session row. Any other error is a fault in trellis itself, so it
// keeps going up.
export const runnerFailure = (error: unknown): AgentFailure => {
	if (error instanceof ORPCError && error.code === "RUNNER_UNAVAILABLE") return error.data as AgentFailure;
	throw error;
};
