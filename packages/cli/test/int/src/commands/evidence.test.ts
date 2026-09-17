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
	const result = await runCli(["evidence", "workspace", agentRunId], { "evidence.workspace": {} });
	expect(result.code).toBe(0);
	expect(result.calls[0]!.input).toEqual({ runId: agentRunId });
});

test("evidence list reads every history page", async () => {
	const storedCheck = {
		id: "check-1",
		runId: agentRunId,
		attemptId: "attempt-1",
		command: "bun",
		args: ["run", "test"],
		timeoutMs: 60000,
		state: "passed",
		exitCode: 0,
		output: "4 pass",
		truncated: false,
		error: null,
		head: "abc123",
		fingerprint: "fingerprint-1",
		finishedFingerprint: "fingerprint-1",
		createdAt: "2026-09-16T12:00:00.000Z",
		finishedAt: "2026-09-16T12:00:01.000Z",
	};
	const storedArtifact = {
		id: "01ARZ3NDEKTSV4RRFFQ69G5FA1",
		runId: agentRunId,
		attemptId: "attempt-1",
		path: "result.txt",
		sha256: "sha256",
		bytes: 6,
		head: "abc123",
		fingerprint: "fingerprint-1",
		createdAt: "2026-09-16T11:59:00.000Z",
	};
	const result = await runCli(["evidence", "list", agentRunId], {
		"evidence.history": (input: { before?: string }) =>
			input.before
				? { items: [{ kind: "artifact", artifact: storedArtifact }], nextCursor: null }
				: { items: [{ kind: "check", check: storedCheck }], nextCursor: "page-2" },
	});
	expect(result.code).toBe(0);
	expect(result.calls.map((call) => call.path)).toEqual(["evidence.history", "evidence.history"]);
	expect(result.calls.map((call) => call.input)).toEqual([
		{ runId: agentRunId },
		{ runId: agentRunId, before: "page-2" },
	]);
	expect(JSON.parse(result.stdout)).toEqual({ checks: [storedCheck], artifacts: [storedArtifact] });
});
