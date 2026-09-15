import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../../test/originDir.ts";
import { buildRuntime } from "../../../../../runtime/test/runtimeBuild.ts";
import { captureRestartPlan } from "../../../../src/captureRestartPlan/captureRestartPlan.ts";

test("capture reads kernel identity from a live runtime and excludes an explicitly stopped agent", async () => {
	await buildRuntime();
	const root = resolve(originDir(import.meta.dir), "../../../..");
	const home = await mkdtemp("/tmp/trl-os-plan-");
	const source = { root: join(home, "release"), manifest: { id: "a".repeat(64), protocol: 6, version: "0.0.0" } };
	await mkdir(join(source.root, "bin"), { recursive: true });
	await mkdir(join(source.root, "packages"));
	await symlink(process.execPath, join(source.root, "bin/bun"));
	await symlink(join(root, "packages/runtime-protocol"), join(source.root, "packages/runtime-protocol"));
	const daemon = spawn(
		process.env.TRELLIS_RUNTIME_NODE ?? "node",
		[join(root, "apps/runtime/dist/index.js"), "--home", join(home, "runtime")],
		{ stdio: ["ignore", "pipe", "inherit"] },
	);
	const exited = new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
	const client = new RuntimeClient(join(home, "runtime/runtime.sock"));
	try {
		await new Promise<void>((resolve, reject) => {
			daemon.stdout!.once("data", () => resolve());
			daemon.once("exit", (code) => reject(new Error(`Runtime exited ${code}`)));
		});
		for (const id of ["active", "manually-stopped"]) {
			const spec = {
				id,
				command: "/bin/cat",
				args: [],
				cwd: home,
				mode: "pty" as const,
				env: { TRELLIS_RUN_ID: `run-${id}`, TRELLIS_ATTEMPT_TOKEN: "fixture-token" },
			};
			await client.start(spec);
			await client.observe(id, "fixture-token", {
				kind: "session",
				sessionId: `provider-${id}`,
				model: "fixture-model",
			});
			await mkdir(join(home, "harness-attempts", id), { recursive: true });
			await writeFile(join(home, "harness-attempts", id, "launch.json"), JSON.stringify({ harness: "codex", spec }));
		}
		await client.stop("manually-stopped");
		const active = await client.inspect("active");
		expect(active.status).toBe("running");
		await captureRestartPlan(home, source, { ...source, manifest: { ...source.manifest, id: "b".repeat(64) } });
		const plan = JSON.parse(await readFile(join(home, "restart-plan.json"), "utf8"));
		expect(plan.sessions).toHaveLength(1);
		expect(plan.sessions[0]).toMatchObject({
			previousAttemptId: "active",
			providerSessionId: "provider-active",
			processIdentity: active.process!.identity,
			workspace: home,
		});
		expect((await client.inspect("active")).pid).toBe(active.pid);
		await client.shutdown();
		await exited;
		expect(() => process.kill(active.pid!, 0)).toThrow();
		expect(JSON.parse(await readFile(join(home, "restart-plan.json"), "utf8"))).toEqual(plan);
	} finally {
		if (daemon.exitCode === null && daemon.signalCode === null) {
			daemon.kill("SIGTERM");
			await exited;
		}
		await rm(home, { recursive: true, force: true });
	}
});
