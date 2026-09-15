import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { z } from "zod";

const hooksResponse = z.object({
	data: z.array(
		z.object({
			errors: z.array(z.object({ message: z.string() })),
			hooks: z.array(
				z.looseObject({ key: z.string(), currentHash: z.string(), enabled: z.boolean(), isManaged: z.boolean() }),
			),
		}),
	),
});
export async function inspectCodexHooks(executable: string, cwd: string): Promise<string> {
	const inspector = spawn(executable, ["app-server", "--stdio"], {
		cwd,
		env: process.env,
		stdio: ["pipe", "pipe", "inherit"],
	});
	const exited = new Promise<void>((resolve, reject) => {
		inspector.once("error", reject);
		inspector.once("exit", (code) =>
			code === 0 ? resolve() : reject(new Error(`Codex hook inspection exited: ${code}`)),
		);
	});
	const lines = createInterface({ input: inspector.stdout });
	const response = new Promise<string>((resolve, reject) => {
		lines.on("line", (line) => {
			const message = JSON.parse(line);
			if (message.error) return reject(new Error(`Codex hook inspection failed: ${JSON.stringify(message.error)}`));
			if (message.id === 1) {
				inspector.stdin.write(
					`${JSON.stringify({ method: "initialized" })}\n${JSON.stringify({ id: 2, method: "hooks/list", params: { cwds: [cwd] } })}\n`,
				);
			} else if (message.id === 2) {
				const result = hooksResponse.parse(message.result);
				const errors = result.data.flatMap((entry) => entry.errors);
				if (errors.length)
					return reject(
						new Error(`Codex hook configuration failed: ${errors.map((error) => error.message).join("; ")}`),
					);
				const entries = result.data.flatMap((entry) => entry.hooks).filter((hook) => hook.enabled && !hook.isManaged);
				resolve(
					`hooks.state={${entries.map((hook) => `${JSON.stringify(hook.key)}={trusted_hash=${JSON.stringify(hook.currentHash)}}`).join(",")}}`,
				);
			}
		});
	});
	const timedOut = new Promise<never>((_, reject) => {
		const timer = setTimeout(() => {
			inspector.kill("SIGKILL");
			reject(new Error("Codex hook inspection timed out"));
		}, 15000);
		exited.then(
			() => clearTimeout(timer),
			() => clearTimeout(timer),
		);
	});
	inspector.stdin.write(
		`${JSON.stringify({ id: 1, method: "initialize", params: { clientInfo: { name: "trellis_hook_inspector", version: "1" }, capabilities: { experimentalApi: true } } })}\n`,
	);
	try {
		const config = await Promise.race([
			response,
			timedOut,
			exited.then(() => {
				throw new Error("Codex hook inspection closed before a response");
			}),
		]);
		inspector.stdin.end();
		await exited;
		return config;
	} finally {
		lines.close();
		if (inspector.exitCode === null) inspector.kill("SIGKILL");
	}
}
