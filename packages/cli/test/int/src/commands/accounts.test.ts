import { expect, test } from "bun:test";
import { runCli } from "../../../deps.ts";
import { agentRun, agentRunId, persona, personaId } from "../../../fixtures.ts";

test("account commands list profiles and read quota without credential access", async () => {
	const listed = await runCli(["accounts", "list"], { "harnessAccounts.list": [] });
	expect(listed.code).toBe(0);
	expect(listed.calls[0]).toMatchObject({ path: "harnessAccounts.list", input: {} });
	const quota = await runCli(["accounts", "quota", agentRunId, "--refresh"], {
		"harnessAccounts.quota": {
			accountId: agentRunId,
			status: "unsupported",
			email: null,
			plan: null,
			detail: null,
			windows: [],
			fetchedAt: new Date().toISOString(),
		},
	});
	expect(quota.code).toBe(0);
	expect(quota.calls[0]).toMatchObject({ path: "harnessAccounts.quota", input: { id: agentRunId, refresh: true } });
});
test("start and resume pass account choice and retain resume guards", async () => {
	const started = await runCli(["agents", "start", personaId, "--ticket", "CDE-42", "--account", agentRunId], {
		"personas.get": persona(),
		"agentRuns.start": agentRun(),
	});
	expect(started.code).toBe(0);
	expect(started.calls[1]!.input).toMatchObject({ accountId: agentRunId });
	const resumed = await runCli(
		[
			"agents",
			"resume",
			agentRunId,
			"--account",
			agentRunId,
			"--expected-terminal-id",
			"old-attempt",
			"--request-id",
			"switch-1",
		],
		{ "agentRuns.resume": agentRun() },
	);
	expect(resumed.code).toBe(0);
	expect(resumed.calls[0]!.input).toEqual({
		id: agentRunId,
		accountId: agentRunId,
		expectedTerminalId: "old-attempt",
		requestId: "switch-1",
	});
});
