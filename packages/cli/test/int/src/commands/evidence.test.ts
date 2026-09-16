import { expect, test } from "bun:test";
import { runCli } from "../../../deps.ts";
import { agentRunId } from "../../../fixtures.ts";

test("evidence has no check command", async () => {
	const result = await runCli(["evidence", "check", agentRunId], {});
	expect(result.code).not.toBe(0);
	expect(result.calls).toHaveLength(0);
});

test("evidence commands preserve workspace-relative paths", async () => {
	for (const operation of ["file", "register"]) {
		const result = await runCli(["evidence", operation, agentRunId, "--path", "docs/result with spaces.txt"], {
			[`evidence.${operation}`]: {},
		});
		expect(result.code).toBe(0);
		expect(result.calls[0]!.input).toEqual({ runId: agentRunId, path: "docs/result with spaces.txt" });
	}
	for (const operation of ["list", "workspace"]) {
		const result = await runCli(["evidence", operation, agentRunId], { [`evidence.${operation}`]: {} });
		expect(result.code).toBe(0);
		expect(result.calls[0]!.input).toEqual({ runId: agentRunId });
	}
});
