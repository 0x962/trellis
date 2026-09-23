import { type ChildProcess, spawn } from "node:child_process";
import { chmod, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { fromHarnessModel } from "@trellis/api/models";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { z } from "zod";
import { failureReason, recordBridgeFailure } from "../bridgeFailure/bridgeFailure.ts";
import { applyTurnActivity } from "../turnActivity/turnActivity.ts";
import type { HarnessEvent } from "../types.ts";
import { MspClient } from "./mspClient.ts";
import { MuseSessionEvents } from "./mspEvents.ts";
import { museControl } from "./museControl.ts";
import { MuseQuestions } from "./museQuestions.ts";
import { answerMuseRequest } from "./museRequests.ts";
import { museTerminalHint, museTranscriptLine } from "./museTerminal.ts";
import { writeMuseQuotaError, writeMuseUsage } from "./museUsage.ts";
import { uuid7 } from "./uuid7.ts";

// The Muse bridge owns one `muse serve` session host and one session in
// it. It speaks the Muse Session Protocol to that host, reports every
// session, turn, tool, message, and result to the runtime, answers the
// host's control socket, and prints the transcript to the terminal it runs
// in. A person types a follow-up into that terminal; Trellis sends one
// through the control socket.

const env = z
	.object({
		TRELLIS_MUSE_EXECUTABLE: z.string(),
		TRELLIS_MUSE_CONTROL_SOCKET: z.string(),
		TRELLIS_MUSE_CONTROL_TOKEN: z.string(),
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
		sessionId: z.string().optional(),
	})
	.parse(JSON.parse(process.argv[2]!));
const runtime = new RuntimeClient(env.TRELLIS_HARNESS_SOCKET);
const directory = dirname(env.TRELLIS_MUSE_CONTROL_SOCKET);
await mkdir(directory, { mode: 0o700 });
await chmod(directory, 0o700);
const session = z.looseObject({ session: z.looseObject({ sessionId: z.string(), modelId: z.string().nullable() }) });
const questions = new MuseQuestions();
const turnStart = z.looseObject({ turnId: z.string(), disposition: z.string() });
const failedTurn = z.looseObject({ terminal: z.literal("failed"), error: z.looseObject({ message: z.string() }) });

const host: ChildProcess = spawn(env.TRELLIS_MUSE_EXECUTABLE, ["serve", "--trust-workspace", "--disable-sandbox"], {
	cwd: launch.cwd,
	env: process.env,
	stdio: ["pipe", "pipe", "inherit"],
});
let stopNormally!: () => void;
const terminated = new Promise<void>((resolve) => {
	stopNormally = resolve;
	process.once("SIGTERM", resolve);
	process.once("SIGHUP", resolve);
});
let eventQueue = Promise.resolve();
let acceptingEvents = true;
let reportFailure!: (error: unknown) => void;
const observationFailed = new Promise<never>((_, reject) => {
	reportFailure = reject;
});
// `usageQueue` runs usage writes in notification order for this bridge.
// `observedAtMs` lets `museUsage.ts` compare writes from other bridge processes.
let usageQueue = Promise.resolve();
function queueUsage(write: () => Promise<unknown>) {
	usageQueue = usageQueue
		.then(write)
		.then(() => undefined)
		.catch(reportFailure);
}
let client: MspClient | undefined;
let control: Awaited<ReturnType<typeof museControl>> | undefined;
let parser: MuseSessionEvents | undefined;
const current = { turnId: null as string | null, working: false };
let sessionId: string | undefined;
let museHome: string | undefined;
// Muse drains a message that arrives during a turn at a point of its own
// choice, and that point can be the middle of a model step, which it then
// cancels. The bridge therefore starts a turn only while the session is
// idle. A prompt that arrives during a turn, or while a start is in flight,
// waits here, and the next turn carries every waiting prompt at once.
const held: string[] = [];
let starting = false;
async function startTurn(prompts: string[]) {
	starting = true;
	try {
		const commandId = uuid7();
		parser!.expectBatch(commandId, prompts);
		const result = turnStart.parse(
			await client!.request("turn/start", {
				commandId,
				sessionId,
				input: prompts.map((text) => ({ type: "text", text })),
				ifBusy: "queue",
			}),
		);
		current.working = true;
		current.turnId = result.turnId;
		if (result.disposition !== "started")
			process.stderr.write(`Muse ${result.disposition} a turn that the bridge started on an idle session\n`);
	} finally {
		starting = false;
	}
}
async function submit(prompt: string) {
	if (current.working || starting || held.length > 0) {
		held.push(prompt);
		return;
	}
	await startTurn([prompt]);
}
function flushHeld() {
	if (current.working || starting || held.length === 0) return;
	const prompts = held.splice(0);
	startTurn(prompts).catch(reportFailure);
}
let submitted!: () => void;
const firstPrompt = new Promise<void>((resolve) => {
	submitted = resolve;
});
const print = (text: string) => process.stdout.write(`${text}\n`);
function record(event: HarnessEvent) {
	questions.observe(event);
	applyTurnActivity(current, event);
	const line = museTranscriptLine(event);
	if (line !== null) print(line);
	eventQueue = eventQueue.then(async () => {
		await runtime.observe(env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN, event);
		if (event.kind === "prompt") submitted();
	});
	eventQueue.catch(reportFailure);
	if (!current.working) flushHeld();
}
const ESCAPE = "\u001b";
const escapeSequence = new RegExp(`${ESCAPE}\\[[0-9;?]*[A-Za-z]`, "g");
function readTerminal() {
	// The terminal is in raw mode, so Ctrl+C reaches the bridge as a byte
	// and never as a signal to the session host. Text collects until Enter
	// and then starts a turn. A bracketed paste keeps its text only.
	if (!process.stdin.isTTY) return;
	process.stdin.setRawMode(true);
	process.stdin.resume();
	let line = "";
	process.stdin.on("data", (chunk: Buffer) => {
		const text = chunk
			.toString()
			.replaceAll(`${ESCAPE}[200~`, "")
			.replaceAll(`${ESCAPE}[201~`, "")
			.replace(escapeSequence, "");
		for (const character of text) {
			if (character === "\x03") {
				line = "";
				if (current.working && current.turnId !== null)
					void client!
						.request("turn/interrupt", { commandId: uuid7(), sessionId, turnId: current.turnId })
						.catch(reportFailure);
			} else if (character === "\r" || character === "\n") {
				process.stdout.write("\n");
				const prompt = line;
				line = "";
				if (prompt.trim() === "") continue;
				void submit(prompt).catch(reportFailure);
			} else if (character === "\x7f" || character === "\b") {
				if (line.length > 0) {
					line = line.slice(0, -1);
					process.stdout.write("\b \b");
				}
			} else if (character >= " ") {
				line += character;
				process.stdout.write(character);
			}
		}
	});
}
async function start() {
	client = new MspClient(
		host,
		(notification) => {
			if (!acceptingEvents) return;
			const usageHome = museHome;
			if (notification.method === "usage/changed" && usageHome !== undefined) {
				queueUsage(() => writeMuseUsage(usageHome, notification.params));
				return;
			}
			if (notification.method === "turn/completed" && usageHome !== undefined) {
				const observedAtMs = Date.now();
				const failure = failedTurn.safeParse(notification.params);
				if (failure.success) queueUsage(() => writeMuseQuotaError(usageHome, failure.data.error.message, observedAtMs));
			}
			if (!parser) return;
			for (const event of parser.parse(notification)) record(event);
		},
		(request) =>
			answerMuseRequest(request, {
				client: client!,
				observe: (value) => {
					for (const event of parser!.parse(value)) record(event);
				},
				fail: reportFailure,
			}),
	);
	client.closed.catch(reportFailure);
	const granted = await client.initialize();
	museHome = granted.museHome;
	const result = session.parse(
		await client.request(
			launch.sessionId ? "session/resume" : "session/start",
			launch.sessionId
				? { commandId: uuid7(), sessionId: launch.sessionId, excludeItems: true }
				: {
						commandId: uuid7(),
						workspaceRoot: launch.cwd,
						approvalMode: "allowAll",
						providerId: "meta",
						...(launch.model ? { modelId: launch.model } : {}),
					},
		),
	);
	if (launch.sessionId && result.session.sessionId !== launch.sessionId)
		throw new Error("Muse resumed a different session");
	sessionId = result.session.sessionId;
	if (launch.sessionId && launch.model)
		await client.request("session/setModel", {
			commandId: uuid7(),
			sessionId,
			model: { modelId: launch.model, providerId: "meta" },
		});
	await client.request("view/subscribe", { sessionId });
	parser = new MuseSessionEvents(sessionId);
	const model = launch.sessionId && launch.model ? launch.model : (result.session.modelId ?? launch.model);
	record({ kind: "session", sessionId, ...(model ? { model: fromHarnessModel("muse", model) } : {}) });
	control = await museControl({
		socket: env.TRELLIS_MUSE_CONTROL_SOCKET,
		token: env.TRELLIS_MUSE_CONTROL_TOKEN,
		sessionId,
		client,
		current: () => current,
		submit,
		answer: (id, answers, cancel) => questions.answer(client!, sessionId!, id, answers, cancel),
	});
	await startTurn([launch.prompt]);
	await firstPrompt;
	print(museTerminalHint);
	readTerminal();
}
try {
	await Promise.race([start().then(() => terminated), observationFailed]);
} catch (error) {
	const observedAtMs = Date.now();
	acceptingEvents = false;
	const usageHome = museHome;
	if (usageHome !== undefined) queueUsage(() => writeMuseQuotaError(usageHome, failureReason(error), observedAtMs));
	await recordBridgeFailure({
		error,
		queued: Promise.all([eventQueue, usageQueue]),
		observe: (event) => runtime.observe(env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN, event),
	});
	process.exitCode = 1;
} finally {
	acceptingEvents = false;
	await usageQueue;
	if (host.exitCode === null && host.signalCode === null) {
		const exited = new Promise<void>((resolve) => host.once("exit", () => resolve()));
		client?.close();
		host.kill("SIGTERM");
		const timer = setTimeout(() => host.kill("SIGKILL"), 5000);
		await exited;
		clearTimeout(timer);
	}
	control?.close();
	await rm(directory, { recursive: true, force: true });
	stopNormally();
}
