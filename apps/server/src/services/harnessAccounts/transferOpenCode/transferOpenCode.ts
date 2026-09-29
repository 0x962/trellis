import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

type Input = {
	from: string;
	to: string;
	sessionId: string;
	cwd: string;
	env: NodeJS.ProcessEnv;
	directory: string;
};

export async function transferOpenCode(input: Input) {
	await mkdir(input.directory, { recursive: true, mode: 0o700 });
	const path = join(input.directory, "session.json");
	await run(input, ["export", input.sessionId], input.from, path);
	const data = z
		.object({ info: z.object({ id: z.string() }), messages: z.array(z.unknown()) })
		.parse(JSON.parse(await readFile(path, "utf8")));
	if (data.info.id !== input.sessionId) throw new Error("OpenCode exported a different session.");
	const output = join(input.directory, "import.stdout");
	await run(input, ["import", path], input.to, output);
	const confirmation = `Imported session: ${input.sessionId}`;
	let tail = "";
	for await (const chunk of createReadStream(output, { encoding: "utf8" })) {
		const text = tail + chunk;
		if (text.includes(confirmation)) return;
		tail = text.slice(-(confirmation.length - 1));
	}
	throw new Error("OpenCode did not confirm the imported session.");
}

async function run(input: Input, args: string[], profile: string, output: string) {
	const stdout = await open(output, "w", 0o600);
	try {
		const errorPath = `${output}.stderr`;
		const stderr = await open(errorPath, "w", 0o600);
		try {
			await new Promise<void>((resolve, reject) => {
				const child = spawn("opencode", args, {
					cwd: input.cwd,
					env: { ...input.env, XDG_DATA_HOME: profile },
					stdio: ["ignore", stdout.fd, stderr.fd],
					timeout: 30000,
				});
				child.once("error", reject);
				child.once("close", (code, signal) => {
					if (code === 0 && !child.killed) resolve();
					else {
						const reason = child.killed ? "timeout" : (signal ?? code);
						reject(new Error(`OpenCode ${args[0]} failed (${reason}). See ${errorPath}.`));
					}
				});
			});
		} finally {
			await stderr.close();
		}
	} finally {
		await stdout.close();
	}
}
