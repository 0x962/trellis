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
