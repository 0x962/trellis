import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { prepareAttempt } from "./prepareAttempt.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test("uses the repository workspace for a new manager attempt", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-prepare-attempt-"));
	roots.push(root);
	const bin = join(root, "bin");
	const workspace = join(root, "workspace");
	await mkdir(bin);
	await mkdir(workspace);
	const executable = join(bin, "pi");
	await writeFile(executable, "#!/bin/sh\n");
	await chmod(executable, 0o755);

	const descriptor = await prepareAttempt(
		{
			runtime: { socketPath: join(root, "runtime.sock") } as RuntimeClient,
			directory: join(root, "attempts"),
			env: { PATH: bin },
			bun: process.execPath,
		},
		{
			id: "attempt-id",
			kind: "manager",
			managerId: "manager-id",
			managerSystemPrompt: "Manage the project.",
			harness: "pi",
			cwd: workspace,
			prompt: "Start work.",
		},
	);

	expect(descriptor.spec.cwd).toBe(workspace);
});
