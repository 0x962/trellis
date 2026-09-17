import { expect, mock, test } from "bun:test";
import { createExecutionEnvironment } from "./executionEnvironment.ts";

test("the desktop resolves its execution environment only when a tool requests it", async () => {
	const pending = Promise.withResolvers<NodeJS.ProcessEnv>();
	const resolve = mock(() => pending.promise);
	const env = {
		TRELLIS_EXECUTION_SHELL: "/bin/zsh",
		TRELLIS_EXECUTION_BIN: "/release/bin",
		TRELLIS_AUTH_TOKEN: "host-token",
	};
	const get = createExecutionEnvironment(env, resolve);
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
	const get = createExecutionEnvironment(
		{ TRELLIS_EXECUTION_SHELL: "/bin/zsh", TRELLIS_EXECUTION_BIN: "/release/bin", PATH: "/usr/bin" },
		resolve,
	);
	await expect(get()).rejects.toThrow("Login shell failed (exit 42).");
	await expect(get()).rejects.toThrow("Login shell failed (exit 42).");
	expect(resolve).toHaveBeenCalledTimes(2);
});

test("a later tool request runs the login shell again after a failed run", async () => {
	let runs = 0;
	const resolve = mock(async () => {
		runs += 1;
		if (runs === 1) throw new Error("The login shell did not answer within 20000 ms.");
		return { PATH: "/release/bin:/user/bin" };
	});
	const get = createExecutionEnvironment(
		{ TRELLIS_EXECUTION_SHELL: "/bin/zsh", TRELLIS_EXECUTION_BIN: "/release/bin", PATH: "/usr/bin" },
		resolve,
	);
	await expect(get()).rejects.toThrow("The login shell did not answer within 20000 ms.");
	expect(await get()).toMatchObject({ PATH: "/release/bin:/user/bin" });
	expect(resolve).toHaveBeenCalledTimes(2);
});

test("two callers that wait at the same time share one login shell run", async () => {
	const pending = Promise.withResolvers<NodeJS.ProcessEnv>();
	const resolve = mock(() => pending.promise);
	const get = createExecutionEnvironment(
		{ TRELLIS_EXECUTION_SHELL: "/bin/zsh", TRELLIS_EXECUTION_BIN: "/release/bin" },
		resolve,
	);
	const both = Promise.all([get(), get()]);
	pending.resolve({ PATH: "/release/bin:/user/bin" });
	const [first, second] = await both;
	expect(first).toMatchObject({ PATH: "/release/bin:/user/bin" });
	expect(second).toEqual(first!);
	expect(resolve).toHaveBeenCalledTimes(1);
});

test("a standalone server uses the environment of its launcher", async () => {
	const resolve = mock(async () => ({}));
	const env = { PATH: "/launcher/bin", GH_TOKEN: "launcher-token" };
	expect(await createExecutionEnvironment(env, resolve)()).toEqual(env);
	expect(resolve).not.toHaveBeenCalled();
});
