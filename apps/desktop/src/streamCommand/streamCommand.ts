import { spawn } from "node:child_process";

export const streamCommand = (command: string, args: string[], onStdout: (text: string) => void): Promise<void> =>
	new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
		const errors: string[] = [];
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", onStdout);
		child.stderr.on("data", (text: string) => errors.push(text));
		child.stdout.on("error", reject);
		child.stderr.on("error", reject);
		child.on("error", reject);
		child.on("close", (code, signal) => {
			if (code === 0) resolve();
			else {
				const stderr = errors.join("");
				reject(Object.assign(new Error(`${command} failed (${signal ?? code}): ${stderr}`), { stderr, code, signal }));
			}
		});
	});
