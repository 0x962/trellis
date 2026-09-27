import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { customLaunch } from "./customLaunch.ts";

const temporaryHomes: string[] = [];

afterAll(async () => {
	for (const directory of temporaryHomes) await rm(directory, { recursive: true, force: true });
});

const createExecutableShellFixture = async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-custom-launch-test-"));
	temporaryHomes.push(home);
	const directory = join(home, "shell path");
	const shell = join(directory, "bash");
	await mkdir(directory);
	await writeFile(shell, "#!/bin/sh\n", { mode: 0o700 });
	return { home, shell };
};

describe("custom launch", () => {
	test("does not replace a missing configured executable with the POSIX shell", async () => {
		const { home } = await createExecutableShellFixture();
		const launchFile = join(home, "harness-attempts", "attempt", "launch.json");
		await expect(
			customLaunch(home, {
				id: "attempt",
				command: "printf ready",
				cwd: "/workspace",
				env: { TRELLIS_EXECUTION_SHELL: join(home, "missing") },
			}),
		).rejects.toThrow("ENOENT");
		await expect(readFile(launchFile)).rejects.toThrow("ENOENT");
	});

	test("retains the shell, command boundary, and interactive PTY in the launch descriptor", async () => {
		const { home, shell } = await createExecutableShellFixture();
		const command = "printf '%s' 'a b'";
		const launch = await customLaunch(home, {
			id: "attempt",
			command,
			cwd: "/workspace with spaces",
			env: { TRELLIS_EXECUTION_SHELL: shell },
		});

		expect(launch).toMatchObject({
			command: shell,
			args: ["-f", "-c", command],
			mode: "pty",
			cols: 120,
			rows: 32,
		});
		const descriptor = JSON.parse(
			await readFile(join(home, "harness-attempts", "attempt", "launch.json"), "utf8"),
		);
		expect(descriptor).toEqual({ harness: "custom", spec: launch });
		expect(descriptor.spec.command).toBe(shell);
	});
});
