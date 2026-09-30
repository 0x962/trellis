import { expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeLaunchWriterScope } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { tempDirs } from "../../tempDir";
import { HarnessHost } from "./harnessHost";

const temporary = tempDirs();

async function fixture() {
	const home = await temporary("trellis-harness-writer-scopes-");
	const bin = join(home, "bin");
	await mkdir(bin);
	await writeFile(join(bin, "codex"), "synthetic executable", { mode: 0o700 });
	const host = new HarnessHost({
		runtime: { socketPath: join(home, "runtime.sock") } as RuntimeClient,
		directory: join(home, "attempts"),
		agentsDirectory: join(home, "agents"),
		env: { PATH: bin, HOME: home, CODEX_HOME: join(home, "profile"), TRELLIS_RUNTIME_NODE: process.execPath },
		bun: process.execPath,
	});
	const input = { id: "attempt", harness: "codex" as const, cwd: home, prompt: "Synthetic name" };
	const writerScopes: RuntimeLaunchWriterScope[] = [
		{ kind: "workspace", directory: home },
		{ kind: "provider", directory: join(home, "profile") },
		{ kind: "repository", directory: join(home, "common.git") },
	];
	return { home, host, input, writerScopes };
}

test("the prepared descriptor retains exact scopes and rejects a changed scope", async () => {
	const f = await fixture();
	const descriptor = await f.host.prepare({ ...f.input, writerScopes: f.writerScopes });
	expect(descriptor.spec.writerScopes).toEqual(f.writerScopes);
	expect(descriptor.spec.capture).toBeUndefined();
	const path = join(f.home, "attempts", f.input.id, "launch.json");
	const bytes = await readFile(path);
	expect(JSON.parse(bytes.toString()).spec.writerScopes).toEqual(f.writerScopes);
	expect(await f.host.prepare({ ...f.input, writerScopes: f.writerScopes })).toEqual(descriptor);
	await expect(f.host.prepare({
		...f.input, writerScopes: [{ kind: "workspace", directory: join(f.home, "other") }],
	})).rejects.toThrow("already has a different launch request");
	expect(await readFile(path)).toEqual(bytes);
});

test("a descriptor without retained writer scopes stays metadata-free", async () => {
	const f = await fixture();
	const descriptor = await f.host.prepare(f.input);
	expect(descriptor.spec.writerScopes).toBeUndefined();
	expect(await f.host.prepare(f.input)).toEqual(descriptor);
	await expect(f.host.prepare({ ...f.input, writerScopes: f.writerScopes }))
		.rejects.toThrow("already has a different launch request");
});
