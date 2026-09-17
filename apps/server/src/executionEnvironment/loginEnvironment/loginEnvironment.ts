import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExecutionEnvironment } from "../executionEnvironment.ts";

const execute = promisify(execFile);

// Runs the login shell and returns what it printed. Returns undefined when the
// shell is still running at `timeoutMs` and the operating system kills it. The
// caller decides whether to run the shell again with a longer limit.
const capture = async (shell: string, env: ExecutionEnvironment, timeoutMs: number) => {
	const result = await execute(shell, ["-ilc", "/usr/bin/env -0"], {
		env: { NODE_ENV: process.env.NODE_ENV, ...env },
		cwd: env.HOME,
		timeout: timeoutMs,
		maxBuffer: 1024 * 1024,
	}).catch((error: { code?: string | number; killed?: boolean }) => {
		if (error.killed) return undefined;
		throw new Error(`Login shell failed (exit ${error.code}).`);
	});
	return result?.stdout;
};

// The first login shell of a session starts while the machine is still busy
// with the rest of the boot, so it can need more time than a later one. A
// second run with twice the limit separates a slow machine from a shell that
// never answers.
export const loginEnvironment = async (
	shell: string,
	bundledBin: string,
	env: ExecutionEnvironment = process.env,
	timeoutMs = 10000,
	retryTimeoutMs = timeoutMs * 2,
): Promise<ExecutionEnvironment> => {
	const stdout = (await capture(shell, env, timeoutMs)) ?? (await capture(shell, env, retryTimeoutMs));
	if (stdout === undefined)
		throw new Error(
			`The login shell did not answer within ${retryTimeoutMs} ms. Check the shell startup files, then retry.`,
		);
	const result: ExecutionEnvironment = {};
	for (const record of stdout.split("\0")) {
		const match = record.match(/(?:^|\n)([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/);
		if (match) result[match[1]!] = match[2]!;
	}
	if (!result.PATH) throw new Error("The login shell did not return PATH. Check the shell startup files.");
	result.PATH = `${bundledBin}:${result.PATH}`;
	return result;
};
