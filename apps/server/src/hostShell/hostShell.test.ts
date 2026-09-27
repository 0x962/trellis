import { afterAll, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POSIX_HOST_SHELL, resolveHostShell } from "./hostShell.ts";

const temporaryHomes: string[] = [];

afterAll(async () => {
	for (const directory of temporaryHomes) await rm(directory, { recursive: true, force: true });
});

const createExecutableShellFixture = async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-host-shell-test-"));
	temporaryHomes.push(home);
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
		const { shell } = await createExecutableShellFixture();
		expect(await resolveHostShell({ TRELLIS_EXECUTION_SHELL: shell })).toBe(shell);
	});

	test("refuses a relative shell path", async () => {
		await expect(resolveHostShell({ TRELLIS_EXECUTION_SHELL: "bin/bash" })).rejects.toThrow(
			"TRELLIS_EXECUTION_SHELL must contain an absolute path",
		);
	});

	test("refuses a missing shell executable", async () => {
		const { home } = await createExecutableShellFixture();
		await expect(resolveHostShell({ TRELLIS_EXECUTION_SHELL: join(home, "missing") })).rejects.toThrow("ENOENT");
	});

	test("refuses a shell without execute permission", async () => {
		const { shell } = await createExecutableShellFixture();
		await chmod(shell, 0o600);
		await expect(resolveHostShell({ TRELLIS_EXECUTION_SHELL: shell })).rejects.toThrow("EACCES");
	});
});
