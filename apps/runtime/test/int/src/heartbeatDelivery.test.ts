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
test.each(["terminal", "native"])("%s heartbeat rejects a changed turn before it reserves input", async (transport) => {
	await start();
	await client.observe("attempt", "secret", {
		kind: "prompt",
		turnId: "first",
		prompt: "trellis-message:attempt\nstart",
	});
	const idle = await client.observe("attempt", "secret", { kind: "idle", outcome: "completed" });
	const expected = {
		turnId: idle.agent!.turnId,
		activityAt: idle.activity!.updatedAt,
		idleBefore: new Date(Date.now() + 1000).toISOString(),
	};
	const send = () =>
		transport === "terminal"
			? client.deliver("attempt", "heartbeat", Buffer.from("heartbeat").toString("base64"), expected)
			: client.registerNativeDelivery("attempt", "secret", "heartbeat", "a".repeat(64), expected);
	await client.observe("attempt", "secret", { kind: "prompt", turnId: "second", prompt: "Human request" });
	await expect(send()).rejects.toMatchObject({ code: "RUNTIME_TURN_CHANGED" });
	const next = await client.observe("attempt", "secret", { kind: "idle", outcome: "completed" });
	expected.turnId = next.agent!.turnId;
	expected.activityAt = next.activity!.updatedAt;
	expected.idleBefore = next.activity!.updatedAt;
	await expect(send()).rejects.toMatchObject({ code: "RUNTIME_TURN_CHANGED" });
	expected.idleBefore = new Date(Date.now() + 1000).toISOString();
	const receipt = await send();
	expect(transport === "terminal" ? receipt.status : (receipt as { claimed: boolean }).claimed).toBe(
		transport === "terminal" ? "written" : true,
	);
});
