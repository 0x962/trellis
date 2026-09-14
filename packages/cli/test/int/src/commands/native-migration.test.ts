import { expect, test } from "bun:test";
import { runCli } from "../../../deps.ts";
import { agentRunId } from "../../../fixtures.ts";

const version = "a".repeat(64);
const requestId = "65856515-73c0-4db6-bda8-99229455601b";
test("native migration apply preserves directory and version bytes", async () => {
	const result = await runCli(
		[
			"native-migration",
			"apply",
			"MIG.child",
			"--directory",
			"/tmp/repo with spaces",
			"--expected-version",
			version,
			"--request-id",
			requestId,
		],
		{ "nativeMigration.apply": { id: agentRunId } },
	);
	expect(result.code).toBe(0);
	expect(result.calls[0]).toMatchObject({
		path: "nativeMigration.apply",
		input: { project: "MIG.child", directory: "/tmp/repo with spaces", expectedVersion: version, requestId },
	});
});
test("native migration preview and rollback use explicit targets", async () => {
	const preview = await runCli(["native-migration", "inventory", "MIG"], { "nativeMigration.inventory": {} });
	expect(preview.code).toBe(0);
	expect(preview.calls[0]!.input).toEqual({ project: "MIG" });
	const rollback = await runCli(["native-migration", "rollback", agentRunId, "--expected-version", version], {
		"nativeMigration.rollback": {},
	});
	expect(rollback.code).toBe(0);
	expect(rollback.calls[0]!.input).toEqual({ migrationId: agentRunId, expectedVersion: version });
});
test("native migration apply requires a stable request and preview version", async () => {
	const result = await runCli(["native-migration", "apply", "MIG", "--directory", "/tmp/repo"], {});
	expect(result.code).not.toBe(0);
	expect(result.calls).toEqual([]);
});
