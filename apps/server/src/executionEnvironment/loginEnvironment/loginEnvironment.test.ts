import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loginEnvironment } from "./loginEnvironment.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const createShell = async (prefix: string) => {
	const root = await mkdtemp(join(tmpdir(), prefix));
	roots.push(root);
	const shell = join(root, "shell");
	await writeFile(shell, "#!/bin/sh\n/usr/bin/env -0\n", { mode: 0o700 });
	return { root, shell };
};

describe("login environment", () => {
	test("does not give the login shell an ambient NODE_ENV when the selected environment omits it", async () => {
		const { root, shell } = await createShell("trellis-login-env-drop-");
		const originalNodeEnv = process.env.NODE_ENV;
		try {
			process.env.NODE_ENV = "ambient";

			const env = await loginEnvironment(shell, "/bundled/bin", { HOME: root, PATH: "/usr/bin:/bin" });

			expect(env.NODE_ENV).toBeUndefined();
			expect(env.PATH).toBe("/bundled/bin:/usr/bin:/bin");
		} finally {
			if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = originalNodeEnv;
		}
	});

	test("gives the login shell the NODE_ENV from the selected environment", async () => {
		const { root, shell } = await createShell("trellis-login-env-set-");
		const originalNodeEnv = process.env.NODE_ENV;
		try {
			process.env.NODE_ENV = "ambient";

			const env = await loginEnvironment(shell, "/bundled/bin", {
				HOME: root,
				NODE_ENV: "selected",
				PATH: "/usr/bin:/bin",
			});

			expect(env.NODE_ENV).toBe("selected");
		} finally {
			if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = originalNodeEnv;
		}
	});
});
