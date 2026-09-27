import { describe, expect, test } from "bun:test";
import { integrationBranches, laneForBranch, readLanePlans } from "./contract";

describe("Linux integration lane plans", () => {
	test("accepts only the six integration branches", () => {
		for (const [branch, lane] of Object.entries(integrationBranches)) {
			expect(laneForBranch(branch)).toBe(lane);
		}
		expect(() => laneForBranch("trellis/trl-517-feature")).toThrow("not a Linux integration branch");
	});

	test("keeps lanes without approved plans inactive", async () => {
		const plans = await readLanePlans();
		for (const [lane, plan] of Object.entries(plans.lanes)) {
			if (lane === "operations" || lane === "verification") continue;
			expect(plan.integratedInputs).toEqual([]);
			expect(plan.focusedTests).toEqual({});
			expect(plan.packages).toEqual({});
			expect(plan.smoke).toEqual({});
			expect(plan.latitude).toEqual({});
			expect(plan.laneReview).toBeNull();
		}
	});

	test("records the reviewed operations inputs and focused commands", async () => {
		const plan = (await readLanePlans()).lanes.operations;
		expect(plan.integratedInputs.map((input) => input.ticketIdentifier)).toEqual([
			"TRL-523",
			"TRL-533",
			"TRL-539",
		]);
		expect(plan.focusedTests["linux-x64"]?.integratedInputTicketIdentifier).toBe("TRL-539");
		expect(plan.focusedTests["linux-x64"]?.requiredPaths).toContain("packages/api/src/schemas/system.ts");
		expect(plan.focusedTests["linux-x64"]?.requiredPaths).toContain(
			"apps/server/src/services/agentRuns/workspace/lineStats.test.ts",
		);
		expect(plan.packages).toEqual({});
		expect(plan.smoke).toEqual({});
		expect(plan.latitude).toEqual({});
	});

	test("records the reviewed verification input and focused command", async () => {
		const plan = (await readLanePlans()).lanes.verification;
		expect(plan.integratedInputs[0]?.ticketIdentifier).toBe("TRL-517");
		expect(plan.focusedTests["linux-x64"]?.integratedInputTicketIdentifier).toBe("TRL-517");
		expect(plan.packages).toEqual({});
		expect(plan.smoke).toEqual({});
		expect(plan.latitude).toEqual({});
	});
});
