import { spawn } from "node:child_process";
import type { LaunchSpec } from "@trellis/runtime-protocol";
import { spawn as spawnPty } from "node-pty";
import { stopProcessTree } from "./stopProcessTree.ts";

export interface ProcessHandle {
	pid: number;
	input(data: Buffer): void;
	resize(cols: number, rows: number): void;
	stop(): void;
}
export function createProcessHandle(
	spec: LaunchSpec,
	output: (data: Buffer) => void,
	stderr: (data: Buffer) => void,
	exited: (code: number | null) => void,
	failed: (error: Error) => void,
): ProcessHandle {
	const env = { ...process.env, ...spec.env };
	if (spec.mode === "pty") {
		const child = spawnPty(spec.command, spec.args, {
			cwd: spec.cwd,
			env,
			cols: spec.cols ?? 80,
			rows: spec.rows ?? 24,
			name: "xterm-256color",
			encoding: null,
		});
		child.onData((data) => output(Buffer.isBuffer(data) ? data : Buffer.from(data)));
		child.onExit(({ exitCode }) => exited(exitCode));
		return {
			pid: child.pid,
			input: (data) => child.write(data),
			resize: (cols, rows) => child.resize(cols, rows),
			stop: () => stopProcessTree(child.pid),
		};
	}
	const child = spawn(spec.command, spec.args, { cwd: spec.cwd, env, detached: true, stdio: "pipe" });
	child.stdout.on("data", output);
	child.stderr.on("data", spec.separateStderr ? stderr : output);
	child.once("error", failed);
	child.once("close", exited);
	return {
		pid: child.pid ?? 0,
		input: (data) => {
			child.stdin.write(data);
		},
		resize: () => {
			throw new Error("Only PTY sessions support resize");
		},
		stop: () => stopProcessTree(child.pid!),
	};
}
