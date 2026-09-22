import { describe, expect, test } from "bun:test";
import { createExecutionEnvironment } from "./executionEnvironment.ts";

describe("execution environment", () => {
	test("keeps omitted values out of the selected environment", async () => {
		const env = await createExecutionEnvironment({ HOME: "/tmp/trellis", NODE_ENV: undefined }, async () => {
			throw new Error("unexpected login shell");
		})();

		expect(env).toEqual({ HOME: "/tmp/trellis" });
		expect("NODE_ENV" in env).toBe(false);
	});

	test("keeps selected values in the selected environment", async () => {
		const env = await createExecutionEnvironment({ HOME: "/tmp/trellis", NODE_ENV: "selected" }, async () => {
			throw new Error("unexpected login shell");
		})();

		expect(env.NODE_ENV).toBe("selected");
	});

	test("fills a missing Trellis value after a login shell chooses the environment", async () => {
		const env = await createExecutionEnvironment(
			{
				TRELLIS_AUTH_TOKEN: "server",
				TRELLIS_EXECUTION_BIN: "/bundled/bin",
				TRELLIS_EXECUTION_SHELL: "/bin/zsh",
			},
			async () => ({ PATH: "/usr/bin:/bin" }),
		)();

		expect(env.TRELLIS_AUTH_TOKEN).toBe("server");
	});

	test("keeps a Trellis value that a login shell sets", async () => {
		const env = await createExecutionEnvironment(
			{
				TRELLIS_AUTH_TOKEN: "server",
				TRELLIS_EXECUTION_BIN: "/bundled/bin",
				TRELLIS_EXECUTION_SHELL: "/bin/zsh",
			},
			async () => ({ PATH: "/usr/bin:/bin", TRELLIS_AUTH_TOKEN: "selected" }),
		)();

		expect(env.TRELLIS_AUTH_TOKEN).toBe("selected");
	});
});
