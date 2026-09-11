#!/usr/bin/env bun
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import type { StubState } from "../../../server/test/stubs/superset.ts";

// This script stands in for the superset binary in the e2e suite.
// TRELLIS_SUPERSET_BIN points the server at it. The server's stub
// (apps/server/test/stubs/superset.ts), the core, records each call in
// TRELLIS_SUPERSET_STUB_LOG and keeps the workspaces and terminals in
// TRELLIS_SUPERSET_STUB_STATE. This script adds the agents: a workspace or a
// terminal whose command starts `claude -n` starts a simulated agent
// (agent.ts), and text sent to a manager terminal gives the simulated
// manager one more turn.
//
// The server waits for this script to exit. Each agent therefore runs as a
// detached process, and this script exits as soon as the core answers.

const args = process.argv.slice(2);
const key = `${args[0]} ${args[1]}`;
const statePath = process.env.TRELLIS_SUPERSET_STUB_STATE!;
const lock = `${statePath}.lock`;

const flag = (name: string) => {
	const index = args.indexOf(name);
	return index === -1 ? null : args[index + 1]!;
};

// The server and the simulated manager can call superset at the same time.
// Each core call reads and writes the whole state file, so the calls run one
// at a time. mkdir is atomic: exactly one caller creates the lock directory.
const acquire = () => {
	for (;;) {
		try {
			mkdirSync(lock);
			return;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			Bun.sleepSync(5);
		}
	}
};

acquire();
const coreStub = join(import.meta.dir, "..", "..", "..", "server", "test", "stubs", "superset.ts");
const core = spawnSync(process.execPath, [coreStub, ...args], { encoding: "utf8" });
const state = JSON.parse(readFileSync(statePath, "utf8")) as StubState;
rmSync(lock, { recursive: true });
process.stdout.write(core.stdout);
process.stderr.write(core.stderr);

type Turn = { mode: "start" | "wake"; command: string; workspaceId: string; terminalId: string };

// The agent writes its output to agents.log beside the state file, so a
// failed spec shows what each simulated agent did.
const launch = ({ mode, command, workspaceId, terminalId }: Turn) => {
	const log = openSync(join(dirname(statePath), "agents.log"), "a");
	const child = spawn(process.execPath, [join(import.meta.dir, "agent.ts"), mode], {
		detached: true,
		stdio: ["ignore", log, log],
		env: {
			...process.env,
			TRELLIS_SIM_COMMAND: command,
			TRELLIS_SUPERSET_BIN: import.meta.path,
			SUPERSET_WORKSPACE_ID: workspaceId,
			SUPERSET_TERMINAL_ID: terminalId,
			CLAUDE_CODE_SESSION_ID: `claude-${terminalId}`,
		},
	});
	child.unref();
};

const command = flag("--command") ?? "";
const startsClaude = command.includes("claude -n ");

if (core.status === 0 && key === "ws create" && startsClaude) {
	const answer = JSON.parse(core.stdout) as {
		workspace: { id: string };
		terminals: Array<{ terminalId: string; label: string }>;
		alreadyExists: boolean;
	};
	// A workspace that already exists runs no command, so no agent starts.
	// The command runs in the terminal labeled Command; a setup script
	// terminal can come before it.
	if (!answer.alreadyExists) {
		const terminal = answer.terminals.find((candidate) => candidate.label === "Command")!;
		launch({ mode: "start", command, workspaceId: answer.workspace.id, terminalId: terminal.terminalId });
	}
}

if (core.status === 0 && key === "terminals create" && startsClaude) {
	const answer = JSON.parse(core.stdout) as { terminalId: string; workspaceId: string };
	launch({ mode: "start", command, workspaceId: answer.workspaceId, terminalId: answer.terminalId });
}

// Only a manager reacts to text. A builder records the forwarded text in the
// core state and the call log, where the spec reads it.
if (core.status === 0 && key === "terminals send") {
	const terminal = state.terminals.find((candidate) => candidate.terminalId === flag("--terminal"))!;
	if (terminal.title.endsWith(" manager")) {
		launch({
			mode: "wake",
			command: terminal.command!,
			workspaceId: terminal.workspaceId,
			terminalId: terminal.terminalId,
		});
	}
}

process.exit(core.status ?? 1);
