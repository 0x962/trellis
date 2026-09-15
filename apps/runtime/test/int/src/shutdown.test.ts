import { afterAll, beforeAll, expect, test } from "bun:test";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../test/originDir.ts";
import { buildRuntime } from "../../runtimeBuild.ts";

const sourceDir = originDir(import.meta.dir);
const fixtures: { home: string; daemon: ChildProcess }[] = [];
beforeAll(buildRuntime);
afterAll(async () => {
	for (const { home, daemon } of fixtures) {
		if (daemon.exitCode === null && daemon.signalCode === null) {
			daemon.kill("SIGTERM");
			await new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
		}
		rmSync(home, { recursive: true, force: true });
	}
});
async function start(pid?: number) {
	const home = mkdtempSync("/tmp/trl-shutdown-");
	if (pid !== undefined) {
		mkdirSync(join(home, "sessions"));
		writeFileSync(
			join(home, "sessions", "unknown.session.json"),
			JSON.stringify({
				fingerprint: null,
				session: {
					id: "unknown",
					daemonId: "previous",
					pid,
					mode: "stdio",
					status: "unknown",
					startedAt: new Date().toISOString(),
					endedAt: null,
					exitCode: null,
					error: null,
				},
			}),
		);
	}
	const daemon = spawn(
		process.env.TRELLIS_RUNTIME_NODE ?? "node",
		[resolve(sourceDir, "../dist/index.js"), "--home", home],
		{ stdio: ["ignore", "pipe", "inherit"] },
	);
	fixtures.push({ home, daemon });
	await new Promise<void>((resolve, reject) => {
		daemon.stdout!.once("data", () => resolve());
		daemon.once("exit", (code) => reject(new Error(`Runtime exited ${code}`)));
	});
	return { home, daemon, client: new RuntimeClient(join(home, "runtime.sock")) };
}
test("shutdown stops agents and check descendants before it acknowledges", async () => {
	const { home, daemon, client } = await start();
	for (const id of ["agent", "check"]) {
		await client.start({ id, command: "/bin/sh", args: ["-c", "sleep 60 & echo $!; wait"], cwd: home, mode: "stdio" });
	}
	await Bun.sleep(100);
	const children = await Promise.all(
		["agent", "check"].map(async (id) =>
			Number(
				Buffer.from((await client.output(id)).data, "base64")
					.toString()
					.trim(),
			),
		),
	);
	const exited = new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
	expect(await client.shutdown()).toBeNull();
	for (const pid of children) {
		expect(pid).toBeGreaterThan(0);
		const state = spawnSync("ps", ["-p", String(pid), "-o", "stat="], { encoding: "utf8" }).stdout.trim();
		expect(state === "" || state.startsWith("Z")).toBe(true);
	}
	await exited;
	expect(existsSync(join(home, "manifest.json"))).toBe(false);
	expect(existsSync(join(home, "runtime.sock"))).toBe(false);
	for (const id of ["agent", "check"])
		expect(JSON.parse(readFileSync(join(home, "sessions", `${id}.session.json`), "utf8")).session.status).toBe(
			"exited",
		);
});
test("shutdown refuses an unknown process and leaves the service available", async () => {
	const { client } = await start(process.pid);
	await expect(client.shutdown()).rejects.toThrow("unknown");
	expect((await client.hello()).pid).toBeGreaterThan(0);
});
test("shutdown accepts a saved unknown process after the OS proves its PID is gone", async () => {
	const { client, daemon } = await start(999999);
	expect((await client.inspect("unknown")).status).toBe("exited");
	const exited = new Promise<void>((done) => daemon.once("exit", () => done()));
	expect(await client.shutdown()).toBeNull();
	await exited;
});
