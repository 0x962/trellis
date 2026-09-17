import { expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../test/originDir.ts";
import { sessionFiles } from "../../../src/sessionFiles.ts";
import { buildRuntime } from "../../runtimeBuild.ts";

const runtimeNode = process.env.TRELLIS_RUNTIME_NODE ?? "node";
const sourceDir = originDir(import.meta.dir);
const boot = async (home: string) => {
	const child = spawn(runtimeNode, [resolve(sourceDir, "../dist/index.js"), "--home", home], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	await new Promise<void>((resolve, reject) => {
		child.stdout!.once("data", () => resolve());
		child.once("exit", (code) => reject(new Error(`Runtime exited ${code}`)));
	});
	return child;
};
const shutdown = async (client: RuntimeClient, daemon: ChildProcess) => {
	const exited = new Promise<void>((done) => daemon.once("exit", () => done()));
	await client.shutdown();
	await exited;
};
const eightDays = 8 * 24 * 60 * 60 * 1000;

test("a restart removes an exited session older than 7 days, its files, and an orphan file", async () => {
	await buildRuntime();
	const home = mkdtempSync("/tmp/trl-retention-");
	const sessions = join(home, "sessions");
	const client = new RuntimeClient(join(home, "runtime.sock"));
	let daemon = await boot(home);
	for (const id of ["old", "fresh"]) {
		await client.start({ id, command: "/bin/cat", args: [], cwd: home, mode: "stdio" });
		expect((await client.stop(id)).status).toBe("exited");
	}
	await shutdown(client, daemon);
	const old = sessionFiles(sessions, "old");
	const saved = JSON.parse(readFileSync(old.session, "utf8")) as { session: { endedAt: string } };
	saved.session.endedAt = new Date(Date.now() - eightDays).toISOString();
	writeFileSync(old.session, JSON.stringify(saved));
	const orphan = join(sessions, "orphan.output.json.bytes");
	writeFileSync(orphan, "");
	daemon = await boot(home);
	expect((await client.list()).map((session) => session.id)).toEqual(["fresh"]);
	for (const path of Object.values(old)) expect(existsSync(path)).toBe(false);
	expect(existsSync(orphan)).toBe(false);
	const fresh = sessionFiles(sessions, "fresh");
	expect(existsSync(fresh.session)).toBe(true);
	expect(existsSync(fresh.outputBytes)).toBe(true);
	await shutdown(client, daemon);
	rmSync(home, { recursive: true, force: true });
});
