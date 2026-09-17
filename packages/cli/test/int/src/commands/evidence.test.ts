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

// A check that fails, and a passed check of an attempt that a restart
// replaced, both exit 6. Exit code 6 alone left the person to read the JSON
// record for the reason.
test("evidence check exits 6 and names the state and the reason", async () => {
	const failed = await runCli(
		["evidence", "check", agentRunId, "--command", "bun", "--args", "[]", "--request-id", requestId],
		{ "evidence.check": { state: "failed", current: true, error: "the command exited 1" } },
	);
	expect(failed.code).toBe(6);
	expect(failed.stderr).toBe("warning: the check is failed: the command exited 1\n");

	const stale = await runCli(
		["evidence", "check", agentRunId, "--command", "bun", "--args", "[]", "--request-id", requestId],
		{ "evidence.check": { state: "passed", current: false, error: null } },
	);
	expect(stale.code).toBe(6);
	expect(stale.stderr).toBe("warning: the check is passed and not current: no error text\n");
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
