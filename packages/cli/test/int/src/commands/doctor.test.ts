import { expect, test } from "bun:test";
import { runCli } from "../../../deps.ts";

test("doctor reads diagnostics and prints JSON", async () => {
	const report = { runtime: { state: "stopped" }, paused: true };
	const result = await runCli(["doctor", "--json"], { "system.doctor": report });
	expect(result.code).toBe(0);
	expect(result.calls).toMatchObject([{ path: "system.doctor", input: {} }]);
	expect(JSON.parse(result.stdout)).toEqual(report);
});
