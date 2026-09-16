import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { buildRuntime } from "../../../runtime/test/runtimeBuild.ts";
import { HarnessHost } from "../../src/agents/harnessHost/harnessHost.ts";

const repo = resolve(import.meta.dir, "../../../..");
export async function harnessHostFixture(options: { nestedRuntime?: boolean } = {}) {
	await buildRuntime();
	const home = await mkdtemp("/tmp/trl-hhost-");
	const bin = join(home, "bin");
	await mkdir(bin);
	await symlink(process.execPath, join(bin, "bun"));
	await symlink(Bun.which("node")!, join(bin, "node"));
	const codexBuild = await Bun.build({
		entrypoints: [resolve(repo, "apps/server/test/fixtures/harnessHost/codexAppServer.ts")],
		target: "node",
		format: "esm",
	});
	if (!codexBuild.success) throw new AggregateError(codexBuild.logs, "Codex fixture build failed");
	for (const harness of ["claude", "codex", "pi", "opencode"]) {
		const executable = join(bin, harness);
		await writeFile(
			executable,
			harness === "codex"
				? `#!${Bun.which("node")}\n${await codexBuild.outputs[0]!.text()}`
				: `#!/usr/bin/env bun\nimport ${JSON.stringify(resolve(repo, "apps/server/test/fixtures/harnessHost/nativeHarness.ts"))};\n`,
		);
		await chmod(executable, 0o700);
	}
	const runtimeHome = options.nestedRuntime ? join(home, "runtime") : home;
	await mkdir(runtimeHome, { recursive: true });
	const client = new RuntimeClient(join(runtimeHome, "runtime.sock"));
	const daemon = spawn(
		process.env.TRELLIS_RUNTIME_NODE ?? "node",
		[resolve(repo, "apps/runtime/dist/index.js"), "--home", runtimeHome],
		{ stdio: ["ignore", "pipe", "inherit"] },
	);
	await new Promise<void>((done) => daemon.stdout!.once("data", () => done()));
	const host = new HarnessHost({
		runtime: client,
		directory: join(home, "attempts"),
		env: { ...process.env, PATH: bin },
		bun: process.execPath,
		observationTimeoutMs: 1500,
	});
	return { home, client, daemon, host };
}
