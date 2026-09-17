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
const exited = async (id: string) => {
	for await (const event of client.subscribeSession(id, AbortSignal.timeout(5000)))
		if (event.type === "session" && event.session.status === "exited") return event.session;
	throw new Error(`No exit for ${id}`);
};

test("elapsed process time advances while running and freezes after confirmed exit", async () => {
	await client.start({ id: "elapsed", command: "/bin/cat", args: [], cwd: home, mode: "pty" });
	const first = await client.inspect("elapsed");
	expect(first.elapsedMs).toBeNumber();
	expect(first.elapsedMs).toBeGreaterThanOrEqual(0);
	await Bun.sleep(30);
	const second = await client.inspect("elapsed");
	expect(second.elapsedMs!).toBeGreaterThan(first.elapsedMs!);
	await client.stop("elapsed");
	const stopped = await client.inspect("elapsed");
	expect(stopped.elapsedMs).toBe(Date.parse(stopped.endedAt!) - Date.parse(stopped.startedAt));
	await Bun.sleep(30);
	expect((await client.inspect("elapsed")).elapsedMs).toBe(stopped.elapsedMs);
});

test("list filters distinguish live activity, successful exits, and process errors", async () => {
	for (const id of ["idle", "working", "unobserved"]) {
		await client.start({
			id,
			command: "/bin/cat",
			args: [],
			cwd: home,
			mode: "pty",
			env: { TRELLIS_ATTEMPT_TOKEN: "query-token" },
		});
	}
	await client.turn("idle", "query-token", "Stop");
	await client.turn("working", "query-token", "UserPromptSubmit");
	await client.start({ id: "failed", command: "/bin/sh", args: ["-c", "exit 7"], cwd: home, mode: "stdio" });
	await exited("failed");
	await client.start({ id: "succeeded", command: "/usr/bin/true", args: [], cwd: home, mode: "stdio" });
	await exited("succeeded");
	expect((await client.list({ status: "running" })).map((row) => row.id).sort()).toEqual([
		"idle",
		"unobserved",
		"working",
	]);
	expect((await client.list({ activity: "idle" })).map((row) => row.id)).toEqual(["idle"]);
	expect((await client.list({ status: "running", activity: "working" })).map((row) => row.id)).toEqual(["working"]);
	expect((await client.list({ status: "exited", hasError: true })).map((row) => row.id)).toEqual(["failed"]);
	expect((await client.list({ status: "exited", hasError: false })).map((row) => row.id)).toEqual(["succeeded"]);
	expect((await client.list({ ids: ["working", "idle", "absent"] })).map((row) => row.id).sort()).toEqual([
		"idle",
		"working",
	]);
	expect((await client.list({ ids: ["working", "idle"], activity: "working" })).map((row) => row.id)).toEqual([
		"working",
	]);
	await client.stop("idle");
	expect(await client.list({ activity: "idle" })).toEqual([]);
});

test.each(["stdio", "pty"] as const)("a missing %s executable returns an actionable process error", async (mode) => {
	const command = join(home, "missing-program");
	await client.start({ id: "missing", command, args: [], cwd: home, mode });
	const result = await exited("missing");
	expect(result.error).toContain(command);
	expect(result.elapsedMs).toBeNumber();
	expect((await client.list({ status: "exited", hasError: true })).map((row) => row.id)).toEqual(["missing"]);
});

test("invalid process filters are rejected instead of ignored", async () => {
	await expect(client.call("list", { status: "sleeping" } as never)).rejects.toThrow("status");
	await expect(client.call("list", { activity: "asleep" } as never)).rejects.toThrow("activity");
	await expect(client.call("list", { hasError: "yes" } as never)).rejects.toThrow("error");
	await expect(client.call("list", { ids: ["../other"] } as never)).rejects.toThrow("identifier");
});
