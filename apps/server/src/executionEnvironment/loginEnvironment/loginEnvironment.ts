import { spawn } from "node:child_process";

const maxBufferBytes = 1024 * 1024;

type LoginShellFailure = { code?: string | number | null; killed?: boolean };

const killProcessGroup = (pid: number) => {
	try {
		process.kill(-pid, "SIGKILL");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
	}
};

const executeLoginShell = (shell: string, env: NodeJS.ProcessEnv, timeoutMs: number) =>
	new Promise<string>((resolve, reject) => {
		const child = spawn(shell, ["-ilc", "/usr/bin/env -0"], {
			cwd: env.HOME,
			detached: true,
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const stdout: Buffer[] = [];
		let stdoutBytes = 0;
		let failure: LoginShellFailure | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		child.once("spawn", () => {
			timer = setTimeout(() => {
				failure = { killed: true };
				killProcessGroup(child.pid!);
			}, timeoutMs);
		});
		child.once("error", (error) => {
			if (timer) clearTimeout(timer);
			reject(error);
		});
		child.stdout.on("data", (chunk: Buffer) => {
			stdoutBytes += chunk.length;
			if (stdoutBytes > maxBufferBytes) {
				failure = { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" };
				killProcessGroup(child.pid!);
				return;
			}
			stdout.push(chunk);
		});
		child.stderr.resume();
		child.once("close", (code) => {
			if (timer) clearTimeout(timer);
			if (failure) reject(failure);
			else if (code !== 0) reject({ code });
			else resolve(Buffer.concat(stdout).toString("utf8"));
		});
	});

// A loaded host runs the interactive startup files in 6 s or more. The limit
// leaves room for that load and still ends a shell that hangs in a startup file.
// A startup file can start a background process that keeps stdout open. Then a
// successful read waits for the full limit, because execute settles only when
// every process closes stdout or the limit destroys the pipe.
const loginShellTimeoutMs = 30000;

export const loginEnvironment = async (
	shell: string,
	bundledBin: string,
	env: NodeJS.ProcessEnv = process.env,
	timeoutMs = loginShellTimeoutMs,
): Promise<NodeJS.ProcessEnv> => {
	const stdout = await executeLoginShell(shell, env, timeoutMs).catch((error: LoginShellFailure) => {
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
