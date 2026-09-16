import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loginEnvironment } from "../../../../../src/executionEnvironment/loginEnvironment/loginEnvironment.ts";

test("a login shell supplies the agent PATH while bundled executables stay first", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-login-env-"));
	try {
		await writeFile(
			join(home, ".zshrc"),
			'export PATH="$HOME/agent-bin:/usr/bin:/bin"\nexport TRELLIS_ENV_TEST="value=with=equals"\n',
		);
		const env = await loginEnvironment("/bin/zsh", "/bundled/bin", { HOME: home, ZDOTDIR: home });
		expect(env.PATH!.startsWith(`/bundled/bin:${home}/agent-bin:`)).toBe(true);
		expect(env.TRELLIS_ENV_TEST).toBe("value=with=equals");
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("shell startup errors do not expose environment values in the execution error", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-login-error-"));
	const shell = join(home, "shell");
	try {
		await writeFile(shell, "#!/bin/sh\nprintf secret-from-startup >&2\nexit 42\n", { mode: 0o700 });
		await expect(loginEnvironment(shell, "/bundled/bin")).rejects.toThrow("Login shell failed (exit 42).");
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("a shell timeout returns a sanitized failure", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-login-timeout-"));
	const shell = join(home, "shell");
	try {
		await writeFile(shell, "#!/bin/sh\nprintf secret-from-startup >&2\nexec /bin/sleep 60\n", { mode: 0o700 });
		await expect(loginEnvironment(shell, "/bundled/bin", { HOME: home }, 50)).rejects.toThrow(
			"Login shell exceeded 50 ms.",
		);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("an interactive zsh that hangs in a startup file ends at the limit", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-login-hang-"));
	try {
		await writeFile(join(home, ".zshrc"), '/bin/sleep 5 &\necho $! > "$HOME/child-pid"\nwait\n');
		const startedAt = performance.now();
		await expect(loginEnvironment("/bin/zsh", "/bundled/bin", { HOME: home, ZDOTDIR: home }, 200)).rejects.toThrow(
			"Login shell exceeded 200 ms.",
		);
		expect(performance.now() - startedAt).toBeLessThan(2000);
		const childPid = Number(await readFile(join(home, "child-pid"), "utf8"));
		const childState = spawnSync("/bin/ps", ["-o", "stat=", "-p", String(childPid)], {
			encoding: "utf8",
		});
		expect(childState.status === 0 || childState.status === 1).toBe(true);
		expect(childState.stdout.trim() === "" || childState.stdout.trim().startsWith("Z")).toBe(true);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});
