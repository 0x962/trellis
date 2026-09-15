import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { buildRuntime } from "../../../runtime/test/runtimeBuild.ts";
import { HarnessHost } from "../../src/agents/harnessHost/harnessHost.ts";

const repo = resolve(import.meta.dir, "../../../..");
export async function harnessHostFixture() {
	await buildRuntime();
	const home = await mkdtemp("/tmp/trl-hhost-");
	const bin = join(home, "bin");
	await mkdir(bin);
	for (const harness of ["claude", "codex", "pi", "opencode"]) {
		const executable = join(bin, harness);
		await writeFile(
			executable,
			`#!${process.execPath}\nimport ${JSON.stringify(resolve(repo, "apps/server/test/fixtures/harnessHost/nativeHarness.ts"))};\n`,
		);
		await chmod(executable, 0o700);
	}
	const client = new RuntimeClient(join(home, "runtime.sock"));
	const daemon = spawn(
		process.env.TRELLIS_RUNTIME_NODE ?? "node",
		[resolve(repo, "apps/runtime/dist/index.js"), "--home", home],
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
