import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../test/originDir.ts";
import { buildRuntime } from "../../runtimeBuild.ts";

const sourceDir = originDir(import.meta.dir);
let home: string;
let client: RuntimeClient;
let daemon: ChildProcess;
beforeAll(buildRuntime);
beforeEach(async () => {
	home = mkdtempSync("/tmp/trl-queries-");
	client = new RuntimeClient(join(home, "runtime.sock"));
	daemon = spawn(process.env.TRELLIS_RUNTIME_NODE ?? "node", [resolve(sourceDir, "../dist/index.js"), "--home", home], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	await new Promise<void>((done, reject) => {
		daemon.stdout!.once("data", () => done());
		daemon.once("exit", (code) => reject(new Error(`Runtime exited ${code}`)));
	});
});
afterEach(async () => {
	await client.shutdown();
	await new Promise<void>((done) => daemon.once("exit", () => done()));
	rmSync(home, { recursive: true, force: true });
});
const start = () =>
	client.start({
		id: "attempt",
		command: "/bin/cat",
		args: [],
		cwd: home,
		mode: "pty",
		env: { TRELLIS_ATTEMPT_TOKEN: "secret" },
	});
test("provider observations require the actual attempt token and acknowledge only observed prompts", async () => {
	await start();
	await expect(client.observe("attempt", "wrong", { kind: "session", sessionId: "provider-session" })).rejects.toThrow(
		"token",
	);
	await client.observe("attempt", "secret", { kind: "session", sessionId: "provider-session", model: "model-one" });
	await client.deliver("attempt", "message-one", Buffer.from("hello").toString("base64"));
	expect((await client.inspect("attempt")).acknowledgedMessageIds).toEqual([]);
	await client.observe("attempt", "secret", {
		kind: "prompt",
		prompt: "trellis-message:message-one\nhello",
		turnId: "turn-one",
	});
	await client.observe("attempt", "secret", { kind: "prompt", prompt: "trellis-message:unregistered\nhello" });
	await client.observe("attempt", "secret", { kind: "prompt", prompt: "quoted trellis-message:attempt\nhello" });
	expect((await client.inspect("attempt")).acknowledgedMessageIds).toEqual(["message-one"]);
	await client.observe("attempt", "secret", { kind: "prompt", prompt: "trellis-message:attempt\ninitial" });
	expect((await client.inspect("attempt")).acknowledgedMessageIds).toEqual(["message-one", "attempt"]);
	await client.stop("attempt");
	await expect(client.observe("attempt", "secret", { kind: "idle" })).rejects.toThrow("controllable");
});
test("provider metadata and errors stay distinct from actual process status", async () => {
	await start();
	await client.observe("attempt", "secret", { kind: "session", sessionId: "provider-session", model: "model-one" });
	await client.observe("attempt", "secret", { kind: "working", turnId: "turn-one" });
	await client.observe("attempt", "secret", {
		kind: "tool-start",
		tool: { id: "tool-one", name: "read", input: { path: "file" } },
	});
	expect(await client.inspect("attempt")).toMatchObject({
		status: "running",
		activity: { state: "working" },
		agent: {
			sessionId: "provider-session",
			model: "model-one",
			turnId: "turn-one",
			tool: { id: "tool-one", name: "read" },
		},
	});
	await client.observe("attempt", "secret", {
		kind: "tool-end",
		tool: { id: "tool-one", name: "read" },
		error: "File not found",
	});
	expect(await client.inspect("attempt")).toMatchObject({
		status: "running",
		activity: { state: "working" },
		agent: { error: null, outcome: null, tool: null },
	});
	expect(await client.list({ hasError: true })).toEqual([]);
	expect(Buffer.from((await client.output("attempt", 0, "events")).data, "base64").toString()).toContain(
		"File not found",
	);
	await client.observe("attempt", "secret", { kind: "error", error: "Provider quota exhausted", outcome: "failed" });
	await client.observe("attempt", "secret", { kind: "idle", outcome: "failed" });
	expect(await client.inspect("attempt")).toMatchObject({
		status: "running",
		error: null,
		activity: { state: "idle" },
		agent: { tool: null, error: "Provider quota exhausted", outcome: "failed" },
	});
	expect((await client.list({ status: "running", hasError: true })).map((row) => row.id)).toEqual(["attempt"]);
	await client.observe("attempt", "secret", { kind: "prompt", prompt: "another turn", turnId: "turn-two" });
	expect(await client.list({ hasError: true })).toEqual([]);
	await client.observe("attempt", "secret", { kind: "idle", result: "finished", outcome: "completed" });
	expect((await client.inspect("attempt")).result?.text).toBe("finished");
	await client.observe("attempt", "secret", { kind: "message", message: { text: "Ready for review." } });
	expect(await client.inspect("attempt")).toMatchObject({
		activity: { state: "idle" },
		agent: {
			lastTool: { input: { path: "file" }, status: "failed", error: "File not found" },
			lastMessage: { text: "Ready for review.", at: expect.any(String) },
		},
	});
});

test("provider events stream complete JSONL history and resume from byte offsets", async () => {
	await start();
	await client.observe("attempt", "secret", {
		kind: "session",
		sessionId: "retained-session",
		model: "retained-model",
	});
	const prefix = await client.output("attempt", 0, "events");
	expect(JSON.parse(Buffer.from(prefix.data, "base64").toString()).event.sessionId).toBe("retained-session");
	const stream = client.subscribe("attempt", prefix.nextOffset, AbortSignal.timeout(5000), "events");
	const received = (async () => {
		const bytes: Buffer[] = [];
		for await (const event of stream) if (event.type === "output") bytes.push(Buffer.from(event.data, "base64"));
		return Buffer.concat(bytes).toString();
	})();
	for (let i = 0; i < 150; i++)
		await client.observe("attempt", "secret", {
			kind: "tool-update",
			tool: { id: "tool", name: "shell", output: `line ${i} ${"é".repeat(400)}` },
		});
	await client.observe("attempt", "secret", { kind: "idle", outcome: "completed", result: "all done" });
	await client.stop("attempt");
	const lines = (await received)
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	expect(lines).toHaveLength(151);
	expect(lines[0].event.tool.output).toBe(`line 0 ${"é".repeat(400)}`);
	expect(lines[149].event.tool.output).toBe(`line 149 ${"é".repeat(400)}`);
	expect(lines[150].event.result).toBe("all done");
	expect(lines.every((line) => typeof line.observedAt === "string")).toBe(true);
	await client.shutdown();
	await new Promise<void>((done) => daemon.once("exit", () => done()));
	daemon = spawn(process.env.TRELLIS_RUNTIME_NODE ?? "node", [resolve(sourceDir, "../dist/index.js"), "--home", home], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	await new Promise<void>((done) => daemon.stdout!.once("data", () => done()));
	expect(await client.inspect("attempt")).toMatchObject({
		activity: { state: "idle", updatedAt: lines[150].observedAt },
		agent: { sessionId: "retained-session", model: "retained-model" },
		result: { text: "all done" },
	});
	const replay: Buffer[] = [];
	let offset = prefix.nextOffset;
	while (true) {
		const chunk = await client.output("attempt", offset, "events");
		if (chunk.data === "") break;
		replay.push(Buffer.from(chunk.data, "base64"));
		offset = chunk.nextOffset;
	}
	expect(Buffer.concat(replay).toString()).toBe(`${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
});

test("malformed provider events fail at the socket boundary", async () => {
	await start();
	for (const event of [
		{ kind: "made-up" },
		{ kind: "tool-start", tool: { id: "tool" } },
		{ kind: "session", sessionId: 42 },
		{ kind: "idle", outcome: "probably" },
	])
		await expect(client.call("observe", { id: "attempt", token: "secret", event } as never)).rejects.toThrow();
	expect((await client.output("attempt", 0, "events")).data).toBe("");
});

test("an old turn completion stays in history without ending the current turn", async () => {
	await start();
	await client.observe("attempt", "secret", { kind: "prompt", prompt: "first", turnId: "first" });
	await client.observe("attempt", "secret", { kind: "prompt", prompt: "second", turnId: "second" });
	await client.observe("attempt", "secret", { kind: "idle", turnId: "first", result: "stale", outcome: "completed" });
	expect(await client.inspect("attempt")).toMatchObject({
		activity: { state: "working" },
		agent: { turnId: "second", outcome: null },
		result: null,
	});
	const records = Buffer.from((await client.output("attempt", 0, "events")).data, "base64")
		.toString()
		.trim()
		.split("\n");
	expect(records).toHaveLength(3);
	expect(JSON.parse(records[2]!).event.result).toBe("stale");
	await client.observe("attempt", "secret", {
		kind: "idle",
		turnId: "second",
		result: "current",
		outcome: "completed",
	});
	expect((await client.inspect("attempt")).result?.text).toBe("current");
});

test("a provider model update preserves active work and accepts automatic input", async () => {
	await start();
	await client.observe("attempt", "secret", { kind: "session", sessionId: "provider", model: "first" });
	await client.input("attempt", Buffer.from("draft").toString("base64"), true);
	await client.observe("attempt", "secret", { kind: "session", model: "second" });
	expect((await client.deliver("attempt", "automatic", Buffer.from("message").toString("base64"))).status).toBe(
		"written",
	);
	await client.observe("attempt", "secret", { kind: "working", turnId: "turn" });
	await client.observe("attempt", "secret", { kind: "session", model: "third" });
	expect(await client.inspect("attempt")).toMatchObject({
		activity: { state: "working" },
		agent: { sessionId: "provider", model: "third", turnId: "turn" },
	});
});

test("an interrupt cannot write to or finish a newer turn", async () => {
	await start();
	await client.observe("attempt", "secret", { kind: "prompt", prompt: "first", turnId: "first" });
	const old = await client.inspect("attempt");
	await Bun.sleep(2);
	await client.observe("attempt", "secret", { kind: "prompt", prompt: "second", turnId: "second" });
	const expected = { turnId: old.agent!.turnId, activityAt: old.activity!.updatedAt };
	await expect(
		client.input("attempt", Buffer.from("stale interrupt").toString("base64"), false, expected),
	).rejects.toThrow("changed");
	await expect(client.observe("attempt", "secret", { kind: "idle", outcome: "interrupted" }, expected)).rejects.toThrow(
		"changed",
	);
	expect((await client.inspect("attempt")).activity?.state).toBe("working");
	expect(Buffer.from((await client.output("attempt")).data, "base64").toString()).not.toContain("stale interrupt");
});

test("a new prompt clears an unreliable old turn ID and binds the first native tool ID", async () => {
	await start();
	await client.observe("attempt", "secret", { kind: "prompt", prompt: "first", turnId: "first" });
	await client.observe("attempt", "secret", { kind: "idle", turnId: "first", outcome: "completed" });
	await client.observe("attempt", "secret", { kind: "prompt", prompt: "second" });
	expect((await client.inspect("attempt")).agent?.turnId).toBeNull();
	await client.observe("attempt", "secret", {
		kind: "tool-start",
		turnId: "second",
		tool: { id: "tool", name: "read" },
	});
	expect((await client.inspect("attempt")).agent?.turnId).toBe("second");
});

test("native API delivery reserves once and only a provider prompt confirms receipt", async () => {
	await start();
	await client.observe("attempt", "secret", { kind: "session", sessionId: "provider" });
	const digest = "a".repeat(64);
	expect((await client.registerNativeDelivery("attempt", "secret", "before-first-prompt", digest)).claimed).toBe(true);
	await client.observe("attempt", "secret", { kind: "idle", outcome: "completed" });
	const reservations = await Promise.all(
		Array.from({ length: 12 }, () => client.registerNativeDelivery("attempt", "secret", "native", digest)),
	);
	expect(reservations.filter((result) => result.claimed)).toHaveLength(1);
	expect(reservations.every((result) => result.status === "unknown")).toBe(true);
	expect((await client.inspect("attempt")).acknowledgedMessageIds).toEqual([]);
	await expect(client.registerNativeDelivery("attempt", "secret", "native", "b".repeat(64))).rejects.toThrow(
		"different",
	);
	await client.observe("attempt", "secret", { kind: "prompt", prompt: "trellis-message:native\nhello" });
	expect(await client.registerNativeDelivery("attempt", "secret", "native", digest)).toMatchObject({
		claimed: false,
		status: "acknowledged",
	});
	await expect(client.registerNativeDelivery("attempt", "wrong", "bad", digest)).rejects.toThrow("token");
});

test("a retryable native error retains active work until a final outcome", async () => {
	await start();
	await client.observe("attempt", "secret", { kind: "prompt", prompt: "request", turnId: "t" });
	await client.observe("attempt", "secret", { kind: "error", turnId: "t", error: "HTTP 503", willRetry: true });
	expect(await client.inspect("attempt")).toMatchObject({
		activity: { state: "working" },
		agent: { error: null, outcome: null },
	});
	expect(Buffer.from((await client.output("attempt", 0, "events")).data, "base64").toString()).toContain(
		'"willRetry":true',
	);
	await client.observe("attempt", "secret", {
		kind: "error",
		turnId: "t",
		error: "Provider exhausted retries",
		willRetry: false,
		outcome: "failed",
	});
	expect(await client.inspect("attempt")).toMatchObject({
		activity: { state: "idle" },
		agent: { error: "Provider exhausted retries", outcome: "failed" },
	});
});
