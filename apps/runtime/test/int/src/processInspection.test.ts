import { afterAll, beforeAll, expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../test/originDir.ts";
import { buildRuntime } from "../../runtimeBuild.ts";

const home = mkdtempSync("/tmp/trl-inspect-");
const sourceDir = originDir(import.meta.dir);
const client = new RuntimeClient(join(home, "runtime.sock"));
let daemon: ChildProcess;
beforeAll(async () => {
	await buildRuntime();
	daemon = spawn(process.env.TRELLIS_RUNTIME_NODE ?? "node", [resolve(sourceDir, "../dist/index.js"), "--home", home], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	await new Promise<void>((done, reject) => {
		daemon.stdout!.once("data", () => done());
		daemon.once("exit", (code) => reject(new Error(`Runtime exited ${code}`)));
	});
});
afterAll(async () => {
	await client.shutdown();
	await new Promise<void>((done) => daemon.once("exit", () => done()));
	rmSync(home, { recursive: true, force: true });
});

test("inspect proves a live PTY process and exposes its launch metadata", async () => {
	const session = await client.start({ id: "inspection", command: "/bin/cat", args: [], cwd: home, mode: "pty" });
	const inspected = await client.inspect(session.id);
	expect(inspected.status).toBe("running");
	expect(inspected.controllable).toBe(true);
	expect(inspected.process?.pid).toBe(session.pid!);
	expect(inspected.process?.parentPid).toBe(daemon.pid!);
	expect(inspected.process?.groupId).toBe(session.pid!);
	expect(inspected.process?.identity).toMatch(new RegExp(`^${session.pid}:\\d+:\\d+$`));
	expect(inspected.launch).toEqual({ command: "/bin/cat", args: [], cwd: home });
	expect(Date.parse(inspected.checkedAt)).toBeGreaterThanOrEqual(Date.parse(session.startedAt));
	await client.stop(session.id);
	const stopped = await client.inspect(session.id);
	expect(stopped.status).toBe("exited");
	expect(stopped.controllable).toBe(false);
	expect(stopped.process).toBeNull();
});

test("external SIGKILL removes the actual process from status", async () => {
	const session = await client.start({ id: "killed", command: "/bin/cat", args: [], cwd: home, mode: "pty" });
	process.kill(session.pid!, "SIGKILL");
	const deadline = Date.now() + 5000;
	let inspected = await client.inspect(session.id);
	while (inspected.status !== "exited" && Date.now() < deadline) {
		await Bun.sleep(20);
		inspected = await client.inspect(session.id);
	}
	expect(inspected.status).toBe("exited");
	expect(inspected.process).toBeNull();
	expect(inspected.controllable).toBe(false);
});

test("authenticated hooks update live turn activity and reject the wrong token", async () => {
	const session = await client.start({
		id: "hooks",
		command: "/bin/cat",
		args: [],
		cwd: home,
		mode: "pty",
		env: { TRELLIS_ATTEMPT_TOKEN: "correct-token" },
	});
	expect((await client.inspect(session.id)).activity).toBeNull();
	await expect(client.turn(session.id, "wrong-token", "SessionStart")).rejects.toThrow("token");
	for (const [event, state] of [
		["SessionStart", "ready"],
		["UserPromptSubmit", "working"],
		["Stop", "idle"],
	] as const) {
		const result = await client.turn(session.id, "correct-token", event);
		expect(result.status).toBe("running");
		expect(result.activity?.state).toBe(state);
		expect(Date.parse(result.activity!.updatedAt)).toBeGreaterThanOrEqual(Date.parse(session.startedAt));
	}
	await client.deliver(session.id, "known-message", Buffer.from("hello\n").toString("base64"));
	expect(
		(await client.turn(session.id, "correct-token", "UserPromptSubmit", "unknown-message")).acknowledgedMessageIds,
	).toEqual([]);
	expect((await client.turn(session.id, "correct-token", "Stop", "known-message")).acknowledgedMessageIds).toEqual([]);
	expect(
		(await client.turn(session.id, "correct-token", "UserPromptSubmit", "known-message")).acknowledgedMessageIds,
	).toEqual(["known-message"]);
	await client.stop(session.id);
	await expect(client.turn(session.id, "correct-token", "SessionStart")).rejects.toThrow("controllable");
});

test("authenticated completion retains the result after the process exits", async () => {
	const session = await client.start({
		id: "result",
		command: "/bin/cat",
		args: [],
		cwd: home,
		mode: "pty",
		env: { TRELLIS_ATTEMPT_TOKEN: "result-token" },
	});
	await client.turn(session.id, "result-token", "UserPromptSubmit", undefined, "Not a completion");
	expect((await client.inspect(session.id)).result).toBeNull();
	const completed = await client.turn(session.id, "result-token", "Stop", undefined, "The task is complete.");
	expect(completed.result?.text).toBe("The task is complete.");
	expect(completed.result?.id).toBeTruthy();
	await client.stop(session.id);
	expect((await client.inspect(session.id)).result).toEqual(completed.result);
});

test("automatic delivery writes during a turn and repeats no message", async () => {
	const id = "idle-delivery";
	await client.start({
		id,
		command: "/bin/cat",
		args: [],
		cwd: home,
		mode: "pty",
		env: { TRELLIS_ATTEMPT_TOKEN: "idle-token" },
	});
	await client.turn(id, "idle-token", "SessionStart");
	const bytes = Buffer.from("one\n").toString("base64");
	const outcomes = await Promise.all([client.deliver(id, "first", bytes), client.deliver(id, "second", bytes)]);
	expect(outcomes.map((outcome) => outcome.status)).toEqual(["written", "written"]);
	await client.turn(id, "idle-token", "UserPromptSubmit", "first");
	expect((await client.inspect(id)).activity?.state).toBe("working");
	expect((await client.deliver(id, "third", bytes)).status).toBe("written");
	expect((await client.deliver(id, "first", bytes)).status).toBe("written");
	await expect(client.deliver(id, "first", Buffer.from("two\n").toString("base64"))).rejects.toThrow(
		"already has different bytes",
	);
	await client.stop(id);
});

test("the authenticated initial prompt acknowledges only its own attempt ID", async () => {
	const id = "initial-prompt";
	await client.start({
		id,
		command: "/bin/cat",
		args: [],
		cwd: home,
		mode: "pty",
		env: { TRELLIS_ATTEMPT_TOKEN: "initial-token" },
	});
	await client.turn(id, "initial-token", "UserPromptSubmit", "another-attempt");
	expect((await client.inspect(id)).acknowledgedMessageIds).toEqual([]);
	await client.turn(id, "initial-token", "UserPromptSubmit", id);
	expect((await client.inspect(id)).acknowledgedMessageIds).toEqual([id]);
	await client.stop(id);
});

test("terminal replies and drafts preserve idle activity", async () => {
	const id = "terminal-replies";
	await client.start({
		id,
		command: "/bin/sh",
		args: ["-c", "trap '' INT; printf ready; exec /bin/cat"],
		cwd: home,
		mode: "pty",
		env: { TRELLIS_ATTEMPT_TOKEN: "reply-token" },
	});
	for await (const event of client.subscribe(id, 0, AbortSignal.timeout(5000))) {
		if (event.type === "output" && Buffer.from(event.data, "base64").toString().includes("ready")) break;
	}
	await client.turn(id, "reply-token", "Stop");
	const idle = (await client.inspect(id)).activity;
	for (const reply of ["\x1b[1;1R", "\x1b[?1;2c", "\x1b]10;rgb:ffff/ffff/ffff\x07", "\x1b[I"]) {
		await client.input(id, Buffer.from(reply).toString("base64"));
	}
	expect((await client.inspect(id)).activity).toEqual(idle);
	await client.input(id, Buffer.from("draft").toString("base64"), true);
	expect((await client.inspect(id)).activity).toEqual(idle);
	expect((await client.deliver(id, "accepted", Buffer.from("automatic\n").toString("base64"))).status).toBe("written");
	expect((await client.inspect(id)).activity).toEqual(idle);
	await client.turn(id, "reply-token", "UserPromptSubmit", "accepted");
	expect((await client.inspect(id)).activity?.state).toBe("working");
	await client.stop(id);
});
