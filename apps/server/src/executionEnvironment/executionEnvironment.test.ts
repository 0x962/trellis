import { expect, mock, test } from "bun:test";
import { createExecutionEnvironment } from "./executionEnvironment.ts";

const desktopEnv = {
	TRELLIS_EXECUTION_SHELL: "/bin/zsh",
	TRELLIS_EXECUTION_BIN: "/release/bin",
	TRELLIS_AUTH_TOKEN: "host-token",
	PATH: "/usr/bin",
};

test("the desktop resolves its execution environment only when a tool requests it", async () => {
	const pending = Promise.withResolvers<NodeJS.ProcessEnv>();
	const resolve = mock(() => pending.promise);
	const get = createExecutionEnvironment(desktopEnv, resolve);
	expect(resolve).not.toHaveBeenCalled();
	const first = get();
	expect(get()).toBe(first);
	expect(resolve).toHaveBeenCalledTimes(1);
	pending.resolve({ PATH: "/release/bin:/user/bin", GH_TOKEN: "shell-token", TRELLIS_AUTH_TOKEN: "wrong-token" });
	expect(await first).toMatchObject({
		PATH: "/release/bin:/user/bin",
		GH_TOKEN: "shell-token",
		TRELLIS_AUTH_TOKEN: "host-token",
	});
	expect(await get()).toEqual(await first);
});

test("a failed shell cannot supply a reduced execution environment", async () => {
	const resolve = mock(async () => {
		throw new Error("Login shell failed (exit 42).");
	});
	const get = createExecutionEnvironment(desktopEnv, resolve);
	await expect(get()).rejects.toThrow("Login shell failed (exit 42).");
	await expect(get()).rejects.toThrow("Login shell failed (exit 42).");
	expect(resolve).toHaveBeenCalledTimes(2);
});

test("a slow login shell fails one spawn and the next spawn runs the shell again", async () => {
	const resolve = mock(async () => ({ PATH: "/release/bin:/user/bin" }));
	resolve.mockRejectedValueOnce(new Error("Login shell exceeded 30000 ms."));
	const get = createExecutionEnvironment(desktopEnv, resolve);
	await expect(get()).rejects.toThrow("Login shell exceeded 30000 ms.");
	const second = get();
	expect(await second).toMatchObject({ PATH: "/release/bin:/user/bin", TRELLIS_AUTH_TOKEN: "host-token" });
	expect(get()).toBe(second);
	expect(resolve).toHaveBeenCalledTimes(2);
});

test("spawns that wait on one failing login shell share its failure, and the next spawn starts a new shell", async () => {
	const pending = Promise.withResolvers<NodeJS.ProcessEnv>();
	const resolve = mock(() => pending.promise);
	const get = createExecutionEnvironment(desktopEnv, resolve);
	const first = get();
	const second = get();
	expect(second).toBe(first);
	pending.reject(new Error("Login shell exceeded 30000 ms."));
	await expect(first).rejects.toThrow("Login shell exceeded 30000 ms.");
	await expect(second).rejects.toThrow("Login shell exceeded 30000 ms.");
	expect(resolve).toHaveBeenCalledTimes(1);
	resolve.mockResolvedValueOnce({ PATH: "/release/bin:/user/bin" });
	expect(await get()).toMatchObject({ PATH: "/release/bin:/user/bin" });
	expect(resolve).toHaveBeenCalledTimes(2);
});

test("a standalone server uses the environment of its launcher", async () => {
	const resolve = mock(async () => ({}));
	const env = { PATH: "/launcher/bin", GH_TOKEN: "launcher-token" };
	expect(await createExecutionEnvironment(env, resolve)()).toEqual(env);
	expect(resolve).not.toHaveBeenCalled();
});
