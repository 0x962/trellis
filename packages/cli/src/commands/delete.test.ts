import { describe, expect, test } from "bun:test";
import { lines, runCli } from "../../test/deps.ts";
import { rpcError } from "../../test/fakeServer.ts";

describe("delete", () => {
	// CLI-105
	test("delete refuses without --yes", async () => {
		const result = await runCli(["delete", "CDE-42"], { "tickets.delete": { deleted: "CDE-42" } });
		expect(result.code).toBe(2);
		expect(lines(result.stderr)).toHaveLength(1);
		expect(result.stderr).toContain("--yes");
		expect(result.calls).toEqual([]);
	});

	// CLI-106
	test("delete --yes --force maps to tickets.delete", async () => {
		const result = await runCli(["delete", "CDE-42", "--yes", "--force"], { "tickets.delete": { deleted: "CDE-42" } });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "tickets.delete" });
		expect(result.calls[0]!.input).toEqual({ ticket: "CDE-42", force: true });

		const refused = await runCli(["delete", "CDE-42", "--yes"], { "tickets.delete": rpcError("AGENT_CANNOT_DELETE") });
		expect(refused.code).toBe(4);
		expect(refused.stderr).toEndWith(" (AGENT_CANNOT_DELETE)\n");

		const quiet = await runCli(["delete", "CDE-42", "--yes", "--quiet"], { "tickets.delete": { deleted: "CDE-42" } });
		expect(quiet.stdout).toBe("CDE-42\n");
	});
});
