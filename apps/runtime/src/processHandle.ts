import { spawn } from "node:child_process";
import type { LaunchSpec } from "@trellis/runtime-protocol";
import { spawn as spawnPty } from "node-pty";
import { platform } from "./platform/index.ts";
import { processCompletion } from "./processCompletion.ts";
import { stopProcessTree } from "./stopProcessTree.ts";

export interface ProcessHandle {
	pid: number;
	input(data: Buffer): Promise<void>;
	resize(cols: number, rows: number): void;
	pauseOutput(): void;
	resumeOutput(): void;
	stop(): void;
}
export function createProcessHandle(
	spec: LaunchSpec,
	output: (data: Buffer) => void,
	stderr: (data: Buffer) => void,
	exited: (code: number | null) => void,
	failed: (error: Error) => void,
	unconfirmed: (error: Error) => void,
	inputFailed: (error: Error) => void,
): ProcessHandle {
	const env = { ...process.env, ...spec.env };
	const launch = platform.prepareLaunch(spec);
	if (spec.mode === "pty") {
		const child = spawnPty(launch.spec.command, launch.spec.args, {
			cwd: spec.cwd,
			env,
			cols: spec.cols ?? 80,
			rows: spec.rows ?? 24,
			name: "xterm-256color",
			encoding: null,
		});
		launch.started(child.pid);
		const completion = processCompletion(() => stopProcessTree(child.pid), exited, unconfirmed);
		child.onData((data) => output(Buffer.isBuffer(data) ? data : Buffer.from(data)));
		child.onExit(({ exitCode }) => completion.closed(exitCode));
		return {
			pid: child.pid,
			input: async (data) => child.write(data),
			resize: (cols, rows) => child.resize(cols, rows),
			pauseOutput: () => child.pause(),
			resumeOutput: () => child.resume(),
			stop: completion.stop,
		};
	}
	const child = spawn(launch.spec.command, launch.spec.args, { cwd: spec.cwd, env, detached: true, stdio: "pipe" });
	if (child.pid !== undefined) launch.started(child.pid);
	const completion = processCompletion(() => stopProcessTree(child.pid!), exited, unconfirmed);
	child.stdout.on("data", output);
	child.stderr.on("data", spec.separateStderr ? stderr : output);
	child.stdin.on("error", inputFailed);
	child.once("error", (error) => {
		completion.failed();
		failed(error);
	});
	child.once("exit", completion.leaderExited);
	child.once("close", completion.closed);
	return {
		pid: child.pid ?? 0,
		input: (data) =>
			new Promise<void>((resolve, reject) => {
				child.stdin.write(data, (error) => (error ? reject(error) : resolve()));
			}),
		resize: () => {
			throw new Error("Only PTY sessions support resize");
		},
		pauseOutput: () => {
			child.stdout.pause();
			child.stderr.pause();
		},
		resumeOutput: () => {
			child.stdout.resume();
			child.stderr.resume();
		},
		stop: completion.stop,
	};
}
