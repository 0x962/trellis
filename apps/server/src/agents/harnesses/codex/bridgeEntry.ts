import { type ChildProcess, spawn } from "node:child_process";
import { watch } from "node:fs";
import { chmod, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { z } from "zod";
import { CodexAppServerClient } from "./appServerClient.ts";
import { CodexAppServerEvents } from "./appServerEvents.ts";
import { applyCodexActivity } from "./codexActivity.ts";
import { codexControl } from "./codexControl.ts";
import { inspectCodexHooks } from "./inspectCodexHooks.ts";

const env = z
	.object({
		TRELLIS_CODEX_EXECUTABLE: z.string(),
		TRELLIS_CODEX_ENGINE_SOCKET: z.string(),
		TRELLIS_CODEX_CONTROL_SOCKET: z.string(),
		TRELLIS_CODEX_CONTROL_TOKEN: z.string(),
		TRELLIS_HARNESS_SOCKET: z.string(),
		TRELLIS_ATTEMPT_ID: z.string(),
		TRELLIS_ATTEMPT_TOKEN: z.string(),
	})
	.parse(process.env);
const launch = z
	.object({ cwd: z.string(), prompt: z.string(), model: z.string().optional(), sessionId: z.string().optional() })
	.parse(JSON.parse(process.argv[2]!));
const trustedHooks = await inspectCodexHooks(env.TRELLIS_CODEX_EXECUTABLE, launch.cwd);
const runtime = new RuntimeClient(env.TRELLIS_HARNESS_SOCKET);
const directory = dirname(env.TRELLIS_CODEX_ENGINE_SOCKET);
await mkdir(directory, { mode: 0o700 });
await chmod(directory, 0o700);
let client: CodexAppServerClient | undefined;
let terminal: ChildProcess | undefined;
let control: Awaited<ReturnType<typeof codexControl>> | undefined;
const socketReady = new Promise<void>((resolve, reject) => {
	const watcher = watch(directory, (_, name) => {
		if (name === "engine.sock") {
			watcher.close();
			clearTimeout(timer);
			resolve();
		}
	});
	const timer = setTimeout(() => {
		watcher.close();
		reject(new Error("Codex app-server socket did not appear within 15 seconds"));
	}, 15000);
});
const engine = spawn(
	env.TRELLIS_CODEX_EXECUTABLE,
	[
		"app-server",
		"-c",
		trustedHooks,
		"--listen",
		`unix://${env.TRELLIS_CODEX_ENGINE_SOCKET}`,
		"-c",
		'approval_policy="never"',
		"-c",
		'sandbox_mode="danger-full-access"',
	],
	{ cwd: launch.cwd, env: process.env, stdio: ["pipe", "ignore", "inherit"] },
);
const engineFailed = new Promise<never>((_, reject) => {
	engine.once("error", reject);
	engine.once("exit", (code, signal) => reject(new Error(`Codex engine exited: ${signal ?? code}`)));
});
let stopNormally!: () => void;
const terminated = new Promise<void>((resolve) => {
	stopNormally = resolve;
	process.once("SIGTERM", resolve);
	process.once("SIGINT", resolve);
});
let eventQueue = Promise.resolve();
let reportFailure!: (error: unknown) => void;
const observationFailed = new Promise<never>((_, reject) => {
	reportFailure = reject;
});
async function start() {
	await socketReady;
	let parser: CodexAppServerEvents | undefined;
	const current = { turnId: null as string | null, working: false };
	let submitted!: () => void;
	const firstPrompt = new Promise<void>((resolve) => {
		submitted = resolve;
	});
	client = new CodexAppServerClient(env.TRELLIS_CODEX_ENGINE_SOCKET, (notification) => {
		if (!parser) return;
		for (const event of parser.parse(notification)) {
			applyCodexActivity(current, event);
			eventQueue = eventQueue.then(async () => {
				await runtime.observe(env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN, event);
				if (event.kind === "prompt") submitted();
			});
			eventQueue.catch(reportFailure);
		}
	});
	client.closed.catch(reportFailure);
	await client.initialize();
	const result = z
		.looseObject({
			thread: z.looseObject({ id: z.string() }),
			model: z.string(),
			approvalPolicy: z.literal("never"),
			sandbox: z.looseObject({ type: z.literal("dangerFullAccess") }),
		})
		.parse(
			await client.request(launch.sessionId ? "thread/resume" : "thread/start", {
				...(launch.sessionId ? { threadId: launch.sessionId } : {}),
				cwd: launch.cwd,
				model: launch.model,
				approvalPolicy: "never",
				sandbox: "danger-full-access",
			}),
		);
	if (launch.sessionId && result.thread.id !== launch.sessionId) throw new Error("Codex resumed a different thread");
	parser = new CodexAppServerEvents(result.thread.id);
	await runtime.observe(env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN, {
		kind: "session",
		sessionId: result.thread.id,
		model: result.model,
	});
	control = await codexControl({
		socket: env.TRELLIS_CODEX_CONTROL_SOCKET,
		token: env.TRELLIS_CODEX_CONTROL_TOKEN,
		sessionId: result.thread.id,
		client,
		current: () => current,
	});
	await client.request("turn/start", {
		threadId: result.thread.id,
		input: [{ type: "text", text: launch.prompt }],
		approvalPolicy: "never",
		sandboxPolicy: { type: "dangerFullAccess" },
	});
	await firstPrompt;
	const args = ["--remote", `unix://${env.TRELLIS_CODEX_ENGINE_SOCKET}`, "resume", "--dangerously-bypass-hook-trust"];
	if (launch.model) args.push("--model", launch.model);
	args.push("--", result.thread.id);
	terminal = spawn(env.TRELLIS_CODEX_EXECUTABLE, args, { cwd: launch.cwd, env: process.env, stdio: "inherit" });
	terminal.once("error", reportFailure);
	terminal.once("exit", (code, signal) => {
		if (code !== 0) reportFailure(new Error(`Codex terminal exited: ${signal ?? code}`));
		else stopNormally();
	});
}
try {
	await Promise.race([start().then(() => terminated), engineFailed, observationFailed]);
} catch (error) {
	await runtime.observe(env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN, {
		kind: "error",
		outcome: "failed",
		error: (error as Error).message,
	});
	process.exitCode = 1;
} finally {
	await Promise.all(
		[engine, ...(terminal ? [terminal] : [])].map(async (child) => {
			if (child.exitCode !== null || child.signalCode !== null) return;
			const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
			child.kill("SIGTERM");
			const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
			await exited;
			clearTimeout(timer);
		}),
	);
	client?.close();
	control?.close();
	await rm(directory, { recursive: true, force: true });
}
