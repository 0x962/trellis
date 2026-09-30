import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { readFile, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeRuntimeSocket, scratchHome, writeExecutable } from "../bridgeTestFixtures/index.ts";

const cleanups: (() => Promise<unknown>)[] = [];
const buildCleanups: (() => Promise<unknown>)[] = [];
const modules = dirname(dirname(Bun.resolveSync("ws/package.json", import.meta.dir)));
let bundlePath: string;
beforeAll(async () => {
	const directory = await scratchHome(buildCleanups);
	bundlePath = join(directory, "bridge.mjs");
	const bundle = await Bun.build({
		entrypoints: [fileURLToPath(new URL("./bridgeEntry.ts", import.meta.url))],
		outdir: directory,
		naming: "bridge.mjs",
		target: "node",
		format: "esm",
		external: ["ws"],
	});
	expect(bundle.success).toBe(true);
	await symlink(modules, join(directory, "node_modules"));
});
afterAll(async () => {
	for (const cleanup of buildCleanups.splice(0).reverse()) await cleanup();
});
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const diagnostic = JSON.stringify({
	level: "ERROR",
	target: "codex_models_manager::manager",
	fields: { message: "failed to renew cache TTL: cache not found" },
});
const progress = JSON.stringify({
	target: "codex_api::sse::responses",
	fields: { message: 'unhandled responses event: "response.compaction.compacting"' },
	spans: [{ name: "turn", "thread.id": "thread-1", "turn.id": "turn-1" }],
});
const screen = "\u001b[2J\u001b[HSend a message> ";
const active = `${diagnostic}\n${progress}\n{partial diagnostic\nplain diagnostic\n`;
const shutdown = "engine shutdown diagnostic";

test.each([1, 2048])(
	"the Codex bridge preserves terminal input with %i startup diagnostics",
	async (count) => {
		const startup = `${diagnostic}\n`.repeat(count);
		const home = await scratchHome(cleanups);
		await symlink(modules, join(home, "node_modules"));
		let compacted!: () => void;
		const progressObserved = new Promise<void>((resolve) => {
			compacted = resolve;
		});
		const runtime = await fakeRuntimeSocket(
			home,
			cleanups,
			(event) => {
				if (event.kind === "tool-update" && event.tool?.name === "Compact") compacted();
				return {};
			},
			"refused",
		);
		const executable = await writeExecutable(
			join(home, "codex.mjs"),
			`#!/usr/bin/env node
import { createServer } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
const path = process.env.TRELLIS_CODEX_ENGINE_SOCKET;
if (process.argv[2] === "app-server") {
	const server = createServer();
	const sockets = new WebSocketServer({ server });
	sockets.on("connection", (socket) => socket.on("message", (bytes) => {
		const request = JSON.parse(bytes.toString());
		const reply = (result) => socket.send(JSON.stringify({ id: request.id, result }));
		const notify = (method, params) => socket.send(JSON.stringify({ method, params: { threadId: "thread-1", turnId: "turn-1", ...params } }));
		if (request.method === "initialize") reply({});
		if (request.method === "thread/start") reply({ thread: { id: "thread-1" }, model: "gpt-5.6-sol", approvalPolicy: "never", sandbox: { type: "dangerFullAccess" } });
		if (request.method === "turn/start") {
			reply({});
			notify("turn/started", { turn: { id: "turn-1" } });
			notify("item/started", { item: { id: "prompt-1", type: "userMessage", content: request.params.input } });
		}
		if (request.method === "terminal/ready") process.stderr.write(${JSON.stringify(active)});
	}));
	process.stderr.write(${JSON.stringify(startup)}, () => server.listen(path));
	process.on("SIGTERM", () => process.stderr.write(${JSON.stringify(shutdown)}, () => process.exit(0)));
} else {
	const socket = new WebSocket("ws+unix://" + path + ":/");
	socket.on("open", () => {
		process.stdout.write(${JSON.stringify(screen)});
		socket.send(JSON.stringify({ method: "terminal/ready" }));
	});
	process.stdin.once("data", (bytes) => {
		process.stdout.write(bytes, () => process.exit(0));
	});
}
`,
		);
		const launchPath = join(home, "codex-launch.json");
		await writeFile(launchPath, JSON.stringify({ cwd: home, prompt: "work" }), { mode: 0o600 });
		const bridge = spawn("node", [bundlePath, launchPath], {
			cwd: home,
			detached: true,
			env: {
				PATH: process.env.PATH,
				HOME: home,
				TRELLIS_CODEX_EXECUTABLE: executable,
				TRELLIS_CODEX_ENGINE_SOCKET: join(home, "e", "engine.sock"),
				TRELLIS_CODEX_CONTROL_SOCKET: join(home, "e", "control.sock"),
				TRELLIS_CODEX_CONTROL_TOKEN: "control-token",
				TRELLIS_HARNESS_SOCKET: runtime.path,
				TRELLIS_ATTEMPT_ID: "attempt-1",
				TRELLIS_ATTEMPT_TOKEN: "attempt-token",
			},
			stdio: "pipe",
		});
		let stdout = "";
		let stderr = "";
		let showScreen!: () => void;
		const screenVisible = new Promise<void>((resolve) => {
			showScreen = resolve;
		});
		bridge.stdout.setEncoding("utf8").on("data", (chunk) => {
			stdout += chunk;
			if (stdout.includes(screen)) showScreen();
		});
		bridge.stderr.setEncoding("utf8").on("data", (chunk) => {
			stderr += chunk;
		});
		const exited = new Promise<number | null>((resolve, reject) => {
			bridge.once("error", reject);
			bridge.once("exit", resolve);
		});
		const closed = new Promise<number | null>((resolve) => {
			bridge.once("close", resolve);
		});
		cleanups.push(async () => {
			try {
				process.kill(-bridge.pid!, "SIGTERM");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
			}
			await closed;
		});
		await Promise.race([
			Promise.all([progressObserved, screenVisible]),
			exited.then(() => {
				throw new Error(`Bridge exits before compaction: ${stderr}`);
			}),
		]);
		expect(stdout).toBe(screen);
		expect(stderr).toBe("");
		bridge.stdin.end("typed reply\n");
		expect(await closed).toBe(0);
		expect(stdout).toBe(`${screen}typed reply\n`);
		expect(stderr).not.toContain(diagnostic);
		expect(stderr).not.toContain(shutdown);
		expect(await readFile(join(home, "codex-engine.log"), "utf8")).toBe(`${startup}${active}${shutdown}`);
		expect((await stat(join(home, "codex-engine.log"))).mode & 0o777).toBe(0o600);
	},
	30_000,
);
