#!/usr/bin/env bun
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

// This script stands in for the superset binary in tests. TRELLIS_SUPERSET_BIN
// points the runner at it. It keeps the workspaces and terminals it made in the
// JSON file TRELLIS_SUPERSET_STUB_STATE, so a later spawn sees what an earlier
// spawn made. Every spawn appends its argument list as one JSON line to
// TRELLIS_SUPERSET_STUB_LOG before it answers.
//
// The answers have the shapes Superset 1.27 prints with --json. `ws create`
// with a branch that a workspace already holds answers alreadyExists true and
// starts no command. A terminal takes its title from the `-n '<name>'` part of
// its command, as Claude Code sets the terminal title from its --name.

export type StubTerminal = {
	terminalId: string;
	workspaceId: string;
	label: string;
	title: string;
	command: string | null;
	exited: boolean;
	sent: string[];
};

export type StubWorkspace = {
	id: string;
	name: string;
	branch: string;
	projectId: string;
	baseBranch: string;
	tag: string;
	// The machine the workspace runs on: the argument of `--host`, or null
	// for `--local`.
	host?: string | null;
};

// One row of `superset hosts list --json`. Superset prints `online` as
// "yes" or "no", not as a boolean.
export type StubHost = { id: string; name: string; online: "yes" | "no" };

export type StubState = {
	projects: Array<{ id: string; name: string; repo: string; path: string }>;
	hosts?: StubHost[];
	workspaces: StubWorkspace[];
	terminals: StubTerminal[];
	next: number;
	// A command key such as "ws create" that exits 1 with this text on stderr.
	failures: Record<string, string>;
	// A command key that exits 1 with this text on stdout and nothing on
	// stderr, as superset does for an error it prints as JSON.
	stdoutFailures?: Record<string, string>;
	// When true, `ws create` also runs the workspace setup script in a
	// terminal of its own, listed before the command terminal, as Superset
	// does for a project with a setup script. That terminal exits at once.
	setupTerminal?: boolean;
};

const args = process.argv.slice(2);
appendFileSync(process.env.TRELLIS_SUPERSET_STUB_LOG!, `${JSON.stringify(args)}\n`);

const statePath = process.env.TRELLIS_SUPERSET_STUB_STATE!;
const state = JSON.parse(readFileSync(statePath, "utf8")) as StubState;
const key = `${args[0]} ${args[1]}`;

const flag = (name: string) => {
	const index = args.indexOf(name);
	return index === -1 ? null : args[index + 1]!;
};

const answer = (value: unknown) => {
	writeFileSync(statePath, JSON.stringify(state));
	process.stdout.write(typeof value === "string" ? value : JSON.stringify(value));
	process.exit(0);
};

const refuse = (message: string) => {
	process.stderr.write(message);
	process.exit(1);
};

const newId = (prefix: string) => `${prefix}-${state.next++}`;

const addTerminal = (workspaceId: string, command: string | null, label = "Terminal") => {
	const title = command === null ? "" : (/-n '([^']*)'/.exec(command)?.[1] ?? "");
	const terminal: StubTerminal = {
		terminalId: newId("t"),
		workspaceId,
		label,
		title,
		command,
		exited: false,
		sent: [],
	};
	state.terminals.push(terminal);
	return terminal;
};

const terminalOf = () => state.terminals.find((terminal) => terminal.terminalId === flag("--terminal"));
const terminalsIn = (workspaceId: string) => state.terminals.filter((terminal) => terminal.workspaceId === workspaceId);

const failure = state.failures[key];
if (failure !== undefined) refuse(failure);

const stdoutFailure = state.stdoutFailures?.[key];
if (stdoutFailure !== undefined) {
	process.stdout.write(stdoutFailure);
	process.exit(1);
}

if (key === "projects list") answer(state.projects);

if (key === "hosts list") answer(state.hosts ?? []);

if (key === "ws create") {
	const existing = state.workspaces.find((workspace) => workspace.branch === flag("--branch"));
	if (existing !== undefined) {
		const terminals = terminalsIn(existing.id).map(({ terminalId, label }) => ({ terminalId, label }));
		answer({ workspace: existing, terminals, alreadyExists: true });
	}
	const workspace: StubWorkspace = {
		id: newId("ws"),
		name: flag("--name") ?? "",
		branch: flag("--branch") ?? "",
		projectId: flag("--project") ?? "",
		// The agent-runs launch template sends neither flag, and superset
		// takes the command without them.
		baseBranch: flag("--base-branch") ?? "",
		tag: (flag("--tag") ?? "").toLowerCase(),
		host: flag("--host"),
	};
	state.workspaces.push(workspace);
	const setup =
		state.setupTerminal === true ? [addTerminal(workspace.id, "./.superset/setup.sh", "Workspace Setup")] : [];
	for (const terminal of setup) terminal.exited = true;
	const terminal = addTerminal(workspace.id, flag("--command"), "Command");
	const listed = [...setup, terminal].map(({ terminalId, label }) => ({ terminalId, label }));
	answer({ workspace, terminals: listed, alreadyExists: false });
}

if (key === "ws open") answer(`superset://workspace/${args[2]}\n`);

if (key === "ws delete") {
	state.workspaces = state.workspaces.filter((workspace) => workspace.id !== args[2]);
	state.terminals = state.terminals.filter((terminal) => terminal.workspaceId !== args[2]);
	answer(`Deleted workspace ${args[2]}\n`);
}

if (key === "terminals create") {
	const workspaceId = flag("--workspace")!;
	if (!state.workspaces.some((workspace) => workspace.id === workspaceId))
		refuse(`Workspace not found: ${workspaceId}`);
	const terminal = addTerminal(workspaceId, flag("--command"));
	answer({ terminalId: terminal.terminalId, workspaceId });
}

if (key === "terminals list") {
	const sessions = terminalsIn(flag("--workspace")!).map(({ terminalId, exited, title }) => ({
		terminalId,
		exited,
		title,
	}));
	answer({ sessions });
}

if (key === "terminals send") {
	const terminal = terminalOf();
	if (terminal === undefined || terminal.exited) refuse("SESSION_EXITED");
	terminal!.sent.push(flag("--text")!);
	answer("sent\n");
}

if (key === "terminals read") answer({ text: (terminalOf()?.sent ?? []).join("\n") });

if (key === "terminals close") {
	const terminal = terminalOf();
	if (terminal === undefined) refuse(`Terminal not found: ${flag("--terminal")}`);
	state.terminals = state.terminals.filter((candidate) => candidate !== terminal);
	answer(`Closed terminal ${flag("--terminal")}\n`);
}

refuse(`no stub answer for ${args.join(" ")}`);
