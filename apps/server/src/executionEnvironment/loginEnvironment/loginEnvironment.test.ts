import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loginEnvironment } from "./loginEnvironment.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const createShell = async (prefix: string, source = "/usr/bin/env -0\n") => {
	const root = await mkdtemp(join(tmpdir(), prefix));
	roots.push(root);
	const shell = join(root, "shell");
	await writeFile(shell, `#!/bin/sh\n${source}`, { mode: 0o700 });
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

	test("reads an environment larger than one MiB", async () => {
		const size = 1024 * 1024 + 4096;
		const { root, shell } = await createShell(
			"trellis-login-env-large-",
			`printf 'PATH=/usr/bin:/bin\\0LARGE='
head -c ${size} /dev/zero | tr '\\0' x
printf '\\0'
`,
		);

		const env = await loginEnvironment(shell, "/bundled/bin", { HOME: root, PATH: "/usr/bin:/bin" });

		expect(env.PATH).toBe("/bundled/bin:/usr/bin:/bin");
		expect(env.LARGE).toHaveLength(size);
	});

	test("keeps embedded newlines in environment values", async () => {
		const { root, shell } = await createShell(
			"trellis-login-env-newlines-",
			"printf 'PATH=/custom/bin\\0MULTILINE=first\\nsecond\\nthird\\0'\n",
		);

		const env = await loginEnvironment(shell, "/bundled/bin", { HOME: root, PATH: "/usr/bin:/bin" });

		expect(env.MULTILINE).toBe("first\nsecond\nthird");
	});

	test("ignores malformed NUL-separated records", async () => {
		const { root, shell } = await createShell(
			"trellis-login-env-malformed-",
			"printf 'shell startup text\\0INVALID-NAME=value\\0PATH=/custom/bin\\0'\n",
		);

		const env = await loginEnvironment(shell, "/bundled/bin", { HOME: root, PATH: "/usr/bin:/bin" });

		expect(env["INVALID-NAME"]).toBeUndefined();
		expect(env.PATH).toBe("/bundled/bin:/custom/bin");
	});

	test("reports a login shell failure", async () => {
		const { root, shell } = await createShell("trellis-login-env-failure-", "exit 23\n");

		await expect(loginEnvironment(shell, "/bundled/bin", { HOME: root, PATH: "/usr/bin:/bin" })).rejects.toThrow(
			"Login shell failed (exit 23).",
		);
	});

	test("stops after the explicit timeout and retry timeout", async () => {
		const { root, shell } = await createShell("trellis-login-env-timeout-", "exec sleep 1\n");

		await expect(
			loginEnvironment(shell, "/bundled/bin", { HOME: root, PATH: "/usr/bin:/bin" }, 10, 20),
		).rejects.toThrow("The login shell did not answer within 20 ms.");
	});
});
