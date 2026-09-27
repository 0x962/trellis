import { afterAll, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { customLaunch } from "../agents/native/customLaunch.ts";
import { POSIX_HOST_SHELL, resolveHostShell } from "./hostShell.ts";

const made: string[] = [];

afterAll(async () => {
	for (const directory of made) await rm(directory, { recursive: true, force: true });
});

const fixture = async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-host-shell-test-"));
	made.push(home);
	const directory = join(home, "shell path");
	const shell = join(directory, "bash");
	await mkdir(directory);
	await writeFile(shell, "#!/bin/sh\n", { mode: 0o700 });
	return { home, shell };
};

describe("host shell", () => {
	test("uses the POSIX shell when the host config omits a shell", async () => {
		expect(await resolveHostShell({})).toBe(POSIX_HOST_SHELL);
	});

	test("uses a configured executable absolute path", async () => {
		const { shell } = await fixture();
		expect(await resolveHostShell({ TRELLIS_EXECUTION_SHELL: shell })).toBe(shell);
	});

	test("refuses a relative shell path", async () => {
		await expect(resolveHostShell({ TRELLIS_EXECUTION_SHELL: "bin/bash" })).rejects.toThrow(
			"TRELLIS_EXECUTION_SHELL must contain an absolute path",
		);
	});

	test("does not replace a missing configured executable with the POSIX shell", async () => {
		const { home } = await fixture();
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

	test("refuses a shell without execute permission", async () => {
		const { shell } = await fixture();
		await chmod(shell, 0o600);
		await expect(resolveHostShell({ TRELLIS_EXECUTION_SHELL: shell })).rejects.toThrow("EACCES");
	});

	test("retains the shell, command boundary, and interactive PTY in the launch descriptor", async () => {
		const { home, shell } = await fixture();
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
		expect(descriptor.spec).toEqual(launch);
	});
});
