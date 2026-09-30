import { once } from "node:events";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { broadcastFixture } from "../../../apps/server/src/services/agentRuns/broadcast/broadcastFixture.ts";

const script = (async () => {
	const build = await Bun.build({
		entrypoints: [resolve(import.meta.dir, "../../../apps/runtime/src/index.ts")],
		target: "node",
		external: ["fs-ext", "node-pty", "koffi"],
	});
	if (!build.success) throw new AggregateError(build.logs, "Runtime fixture build fails");
	return build.outputs[0]!.text();
})();

async function runtime() {
	const home = await mkdtemp(join(tmpdir(), "trellis-bc-"));
	try {
		await symlink(resolve(import.meta.dir, "../../../node_modules"), join(home, "node_modules"));
		await writeFile(join(home, "index.js"), await script);
		const child = Bun.spawn(["node", join(home, "index.js"), "--home", join(home, "runtime")], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const stderr = new Response(child.stderr).text();
		const lines = createInterface({ input: Readable.from(child.stdout) });
		const close = async () => {
			child.kill("SIGTERM");
			await child.exited;
			lines.close();
			await rm(home, { recursive: true, force: true });
		};
		try {
			await Promise.race([
				once(lines, "line", { signal: AbortSignal.timeout(10_000) }),
				child.exited.then(async (code) => {
					throw new Error(`Runtime exits ${code}: ${await stderr}`);
				}),
			]);
			return { home, close };
		} catch (error) {
			await close();
			throw error;
		}
	} catch (error) {
		await rm(home, { recursive: true, force: true });
		throw error;
	}
}

export async function fixture() {
	const host = await runtime();
	const { home } = host;
	const client = new RuntimeClient(join(home, "runtime", "runtime.sock"));
	let database: Awaited<ReturnType<typeof broadcastFixture>>;
	try {
		database = await broadcastFixture();
	} catch (error) {
		await host.close();
		throw error;
	}
	const token = "controlled-recipient";
	type Recipient = "workingAgent" | "workingFlow" | "idleAgent" | "idleSession";
	const start = async (key: Recipient) => {
		const id = database.terminals[key];
		const sessionId = `provider-${database.ids[key]}`;
		const spec = {
			id,
			command: "/bin/cat",
			args: [],
			cwd: home,
			mode: "stdio" as const,
			env: { TRELLIS_ATTEMPT_TOKEN: token },
		};
		await mkdir(join(home, "harness-attempts", id), { recursive: true });
		await writeFile(join(home, "harness-attempts", id, "launch.json"), JSON.stringify({ harness: "claude", spec }));
		await client.start(spec);
		await client.observe(id, token, { kind: "session", sessionId });
		await client.observe(id, token, { kind: "prompt", sessionId, prompt: `trellis-message:${id}\nInitial task` });
		if (key === "idleAgent" || key === "idleSession")
			await client.observe(id, token, { kind: "idle", sessionId, outcome: "completed" });
	};
	try {
		await start("workingAgent");
		await start("workingFlow");
		await start("idleAgent");
		await start("idleSession");
	} catch (error) {
		await host.close();
		await database.close();
		throw error;
	}
	return {
		...database,
		client,
		home,
		ctx: { ...database.ctx, home },
		idle: (key: "workingAgent" | "workingFlow") =>
			client.observe(database.terminals[key], token, { kind: "idle", outcome: "completed" }),
		output: async (key: Recipient) =>
			Buffer.from((await client.output(database.terminals[key])).data, "base64").toString(),
		async waitForOutput(key: Recipient, text: string) {
			for (let i = 0; i < 100; i++) {
				const output = Buffer.from((await client.output(database.terminals[key])).data, "base64").toString();
				if (output.includes(text)) return;
				await Bun.sleep(10);
			}
			throw new Error("The recipient does not receive the expected text");
		},
		async close() {
			await host.close();
			await database.close();
		},
	};
}
