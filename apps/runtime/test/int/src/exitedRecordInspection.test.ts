import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../test/originDir.ts";
import { buildRuntime } from "../../runtimeBuild.ts";

const runtimeNode = process.env.TRELLIS_RUNTIME_NODE ?? "node";
const sourceDir = originDir(import.meta.dir);

test("an exited record whose pid now belongs to another user stays exited", async () => {
	await buildRuntime();
	const home = mkdtempSync("/tmp/trl-exited-record-");
	mkdirSync(join(home, "sessions"), { recursive: true, mode: 0o700 });
	const startedAt = new Date().toISOString();
	// pid 1 is launchd, owned by root, so proc_pidinfo(1) fails with EPERM for this user.
	writeFileSync(
		join(home, "sessions", "previous.session.json"),
		JSON.stringify({
			session: {
				id: "previous",
				daemonId: "old",
				pid: 1,
				mode: "stdio",
				status: "exited",
				startedAt,
				endedAt: startedAt,
				exitCode: 0,
				error: null,
			},
			fingerprint: null,
			identity: null,
			launch: null,
		}),
	);
	const daemon = spawn(runtimeNode, [resolve(sourceDir, "../dist/index.js"), "--home", home], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	await new Promise<void>((done, reject) => {
		daemon.stdout!.once("data", () => done());
		daemon.once("exit", (code) => reject(new Error(`Runtime exited ${code}`)));
	});
	const client = new RuntimeClient(join(home, "runtime.sock"));
	try {
		expect(await client.inspect("previous")).toMatchObject({ status: "exited", controllable: false, error: null });
	} finally {
		const exited = new Promise<void>((done) => daemon.once("exit", () => done()));
		await client.shutdown();
		await exited;
		rmSync(home, { recursive: true, force: true });
	}
});
