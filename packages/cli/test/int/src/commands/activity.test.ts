import { describe, expect, test } from "bun:test";
import { runCli } from "../../../deps.ts";
import { activity, comment } from "../../../fixtures.ts";

// Newest first: a later move to agent-review, an earlier move to human-review,
// and a comment between them that an activity listing leaves out.
const page = () => ({
	items: [
		activity({ id: 9, toValue: "agent-review", createdAt: "2026-09-09T10:04:00.000Z" }),
		comment(),
		activity({ id: 7, toValue: "human-review", createdAt: "2026-09-09T10:02:00.000Z" }),
	],
	nextCursor: null,
});

describe("activity", () => {
	// CLI-108
	test("activity lists the activity items of a ticket", async () => {
		const result = await runCli(["activity", "CDE-42", "--limit", "20"], { "timeline.list": page() }, { tty: true });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "timeline.list" });
		expect(result.calls[0]!.input).toEqual({ ticket: "CDE-42", limit: 20 });
		expect(result.stdout).toContain("agent-review");
		expect(result.stdout).toContain("human-review");
		expect(result.stdout.indexOf("agent-review")).toBeLessThan(result.stdout.indexOf("human-review"));
		expect(result.stdout).not.toContain("Body A");
	});

	// CLI-109: the contract has no project activity procedure. An agent must
	// read a refusal, never an exit 0 with no activity.
	test("activity --project exits 2 with a usage error until the contract has a route", async () => {
		const result = await runCli(["activity", "--project", "CDE"]);
		expect(result.code).toBe(2);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("--project");
		expect(result.calls).toEqual([]);

		const help = await runCli(["activity", "--help"]);
		expect(help.code).toBe(0);
		expect(help.stdout).toContain("activity");
		expect(help.stdout).not.toContain("--project");
	});
});
