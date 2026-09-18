import { type ChildProcess, spawn } from "node:child_process";
import { watch } from "node:fs";
import { chmod, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { fromHarnessModel } from "@trellis/api/models";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { z } from "zod";
import { applyTurnActivity } from "../turnActivity/turnActivity.ts";
import type { HarnessEvent } from "../types.ts";
import { CodexAppServerClient } from "./appServerClient.ts";
import { CodexAppServerEvents } from "./appServerEvents.ts";
import { codexControl } from "./codexControl.ts";
import { engineOptions } from "./engineOptions.ts";

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
	.object({
		cwd: z.string(),
		prompt: z.string(),
		model: z.string().optional(),
		effort: z.string().optional(),
		sessionId: z.string().optional(),
	})
	.parse(JSON.parse(process.argv[2]!));
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
		...engineOptions(launch.effort),
		"--listen",
		`unix://${env.TRELLIS_CODEX_ENGINE_SOCKET}`,
		"-c",
		'approval_policy="never"',
		"-c",
		'sandbox_mode="danger-full-access"',
	],
	{
		cwd: launch.cwd,
		env: {
			...process.env,
			LOG_FORMAT: "json",
			RUST_LOG: `${process.env.RUST_LOG ?? "error"},codex_core::tasks=info,codex_api::endpoint::responses_websocket=info,codex_api::sse::responses=debug`,
		},
		stdio: ["pipe", "ignore", "pipe"],
	},
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
let acceptingEvents = true;
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
	const observe = (events: HarnessEvent[]) => {
		if (!acceptingEvents) return;
		for (const event of events) {
			applyTurnActivity(current, event);
			eventQueue = eventQueue.then(async () => {
				await runtime.observe(env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN, event);
				if (event.kind === "prompt") submitted();
			});
			eventQueue.catch(reportFailure);
		}
	};
	client = new CodexAppServerClient(
		env.TRELLIS_CODEX_ENGINE_SOCKET,
		(notification) => {
			if (parser) observe(parser.parse(notification));
		},
		undefined,
	);
	const engineLines = createInterface({ input: engine.stderr! });
	engineLines.on("line", (line) => {
		if (line.startsWith("{")) {
			const entry = JSON.parse(line);
			if (parser) observe(parser.compactionProgress(entry));
			if (
				["codex_core::tasks", "codex_api::endpoint::responses_websocket", "codex_api::sse::responses"].includes(
					entry.target,
				) &&
				["INFO", "DEBUG", "TRACE"].includes(entry.level)
			)
				return;
		}
		process.stderr.write(`${line}\n`);
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
		model: fromHarnessModel("codex", result.model),
	});
	control = await codexControl({
		socket: env.TRELLIS_CODEX_CONTROL_SOCKET,
		token: env.TRELLIS_CODEX_CONTROL_TOKEN,
		sessionId: result.thread.id,
		client,
		effort: launch.effort,
		current: () => current,
	});
	await client.request("turn/start", {
		threadId: result.thread.id,
		input: [{ type: "text", text: launch.prompt }],
		effort: launch.effort,
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
	acceptingEvents = false;
	await eventQueue;
	await runtime.observe(env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN, {
		kind: "error",
		outcome: "failed",
		error: (error as Error).message,
	});
	process.exitCode = 1;
} finally {
	acceptingEvents = false;
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
