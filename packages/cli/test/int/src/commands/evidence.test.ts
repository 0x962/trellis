import { expect, test } from "bun:test";
import { runCli } from "../../../deps.ts";
import { agentRunId } from "../../../fixtures.ts";

const requestId = "65856515-73c0-4db6-bda8-99229455601b";

test("evidence check preserves argv bytes and a stable request ID", async () => {
	const args = ["-e", 'console.log("$HOME `literal` ; \\n")', "argument with spaces", ""];
	const result = await runCli(
		[
			"evidence",
			"check",
			agentRunId,
			"--command",
			"/path with spaces/bun",
			"--args",
			JSON.stringify(args),
			"--timeout-ms",
			"1200",
			"--request-id",
			requestId,
		],
		{ "evidence.check": { state: "passed", current: true } },
	);
	expect(result.code).toBe(0);
	expect(result.calls[0]).toMatchObject({
		path: "evidence.check",
		input: { runId: agentRunId, command: "/path with spaces/bun", args, timeoutMs: 1200, requestId },
	});
});

test("evidence check rejects malformed argv before an API call", async () => {
	for (const args of ['["unfinished"', "[1]", '"shell text"']) {
		const result = await runCli(
			["evidence", "check", agentRunId, "--command", "bun", "--args", args, "--request-id", requestId],
			{},
		);
		expect(result.code).not.toBe(0);
		expect(result.calls).toHaveLength(0);
		expect(result.stderr).toContain("JSON array of strings");
	}
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
