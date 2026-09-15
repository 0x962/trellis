import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

// A loaded host runs the interactive startup files in 6 s or more. The limit
// leaves room for that load and still ends a shell that hangs in a startup file.
const loginShellTimeoutMs = 30000;

export const loginEnvironment = async (
	shell: string,
	bundledBin: string,
	env: NodeJS.ProcessEnv = process.env,
	timeoutMs = loginShellTimeoutMs,
): Promise<NodeJS.ProcessEnv> => {
	const { stdout } = await execute(shell, ["-ilc", "/usr/bin/env -0"], {
		env,
		cwd: env.HOME,
		timeout: timeoutMs,
		maxBuffer: 1024 * 1024,
	}).catch((error: { code?: string | number; killed?: boolean }) => {
		throw new Error(
			error.killed ? `Login shell exceeded ${timeoutMs} ms.` : `Login shell failed (exit ${error.code}).`,
		);
	});
	const result: NodeJS.ProcessEnv = {};
	for (const record of stdout.split("\0")) {
		const match = record.match(/(?:^|\n)([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/);
		if (match) result[match[1]!] = match[2]!;
	}
	if (!result.PATH) throw new Error("The login shell did not return PATH. Check the shell startup files.");
	result.PATH = `${bundledBin}:${result.PATH}`;
	return result;
};
