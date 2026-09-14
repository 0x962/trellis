import { afterAll, beforeAll, expect, test } from "bun:test";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../test/originDir.ts";
import { buildRuntime } from "../../runtimeBuild.ts";

const sourceDir = originDir(import.meta.dir);
const home = mkdtempSync("/tmp/trl-timeout-");
let daemon: ChildProcess;
let client: RuntimeClient;
beforeAll(async () => {
	await buildRuntime();
	daemon = spawn(process.env.TRELLIS_RUNTIME_NODE ?? "node", [resolve(sourceDir, "../dist/index.js"), "--home", home], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	await new Promise<void>((resolve, reject) => {
		daemon.stdout!.once("data", () => resolve());
		daemon.once("exit", (code) => reject(new Error(`Runtime exited ${code}`)));
	});
	client = new RuntimeClient(join(home, "runtime.sock"));
});
afterAll(async () => {
	daemon.kill("SIGTERM");
	await new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
	rmSync(home, { recursive: true, force: true });
});
test("a runtime deadline stops descendants while the host is disconnected", async () => {
	const spec = {
		id: "deadline",
		command: "/bin/sh",
		args: ["-c", "sleep 60 & echo $!; wait"],
		cwd: home,
		mode: "stdio" as const,
		timeoutMs: 200,
	};
	await client.start(spec);
	await Bun.sleep(400);
	const reconnected = new RuntimeClient(join(home, "runtime.sock"));
	const session = (await reconnected.list()).find((row) => row.id === spec.id)!;
	expect(session.status).toBe("exited");
	expect(session.error).toBe("Process timed out after 200 ms");
	const childPid = Number(
		Buffer.from((await reconnected.output(spec.id)).data, "base64")
			.toString()
			.trim(),
	);
	expect(childPid).toBeGreaterThan(0);
	const state = spawnSync("ps", ["-p", String(childPid), "-o", "stat="], { encoding: "utf8" }).stdout.trim();
	expect(state === "" || state.startsWith("Z")).toBe(true);
	expect((await reconnected.start(spec)).status).toBe("exited");
});
test("normal completion clears the deadline", async () => {
	await client.start({
		id: "finished",
		command: "/bin/echo",
		args: ["done"],
		cwd: home,
		mode: "stdio",
		timeoutMs: 100,
	});
	await Bun.sleep(200);
	const session = (await client.list()).find((row) => row.id === "finished")!;
	expect(session.exitCode).toBe(0);
	expect(session.error).toBeNull();
});
