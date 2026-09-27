import { describe, expect, test } from "bun:test";
import {
	evidenceArtifactName,
	integratedInputEvidence,
	integratedInputGaps,
	integrationBranches,
	laneForBranch,
	missingRequiredPaths,
	packageArtifactName,
	readLanePlans,
	resultArtifactName,
} from "./contract";

describe("Linux integration workflow contract", () => {
	test("accepts only the six integration branches", () => {
		for (const [branch, lane] of Object.entries(integrationBranches)) {
			expect(laneForBranch(branch)).toBe(lane);
		}
		expect(() => laneForBranch("trellis/trl-517-feature")).toThrow("not a Linux integration branch");
	});

	test("keeps initial lane commands empty", async () => {
		const plans = await readLanePlans();
		for (const plan of Object.values(plans.lanes)) {
			expect(plan).toEqual({
				integratedInputs: [],
				focusedTests: {},
				packages: {},
				smoke: {},
				latitude: {},
			});
		}
	});

	test("blocks an input when its reviewed commit differs", () => {
		const input = integratedInputEvidence({
			ticketIdentifier: "TRL-523",
			ticketId: "ticket-id",
			diffUrl: "https://github.com/0x962/trellis/pull/523",
			commit: "reviewed",
			integratedCommit: "integrated",
			reviewRunId: "review-run",
			reviewResult: "succeeded",
			findings: [{ id: "finding", status: "resolved", resolution: "The fix passed review." }],
		});
		expect(input.verification).toBe("failed");
	});

	test("passes a reviewed input with resolved findings", () => {
		const input = integratedInputEvidence({
			ticketIdentifier: "TRL-523",
			ticketId: "ticket-id",
			diffUrl: "https://github.com/0x962/trellis/pull/523",
			commit: "same",
			integratedCommit: "same",
			reviewRunId: "review-run",
			reviewResult: "succeeded",
			findings: [{ id: "finding", status: "resolved", resolution: "The fix passed review." }],
		});
		expect(input.verification).toBe("passed");
	});

	test("keeps a missing input field unverified", () => {
		const input = integratedInputEvidence({
			ticketIdentifier: "TRL-523",
			ticketId: "ticket-id",
			diffUrl: "https://github.com/0x962/trellis/pull/523",
			commit: "same",
			integratedCommit: "same",
			reviewResult: "succeeded",
			findings: [],
		});
		expect(input.verification).toBe("unverified");
	});

	test("keeps an empty integrated input list unverified", () => {
		expect(integratedInputGaps([])).toEqual([
			{
				verification: "unverified",
				reason: "The lane plan has no integrated ticket or diff input.",
			},
		]);
	});

	test("reports a required source path that is absent", () => {
		const paths = ["apps/server/src/services/systemUsage/linux", "present"];
		expect(missingRequiredPaths(paths, (path) => path === "present")).toEqual([
			"apps/server/src/services/systemUsage/linux",
		]);
	});

	test("includes the run and attempt in every artifact name", () => {
		const identity = {
			lane: "verification" as const,
			commit: "a".repeat(40),
			runId: "123",
			runAttempt: "2",
		};
		expect(resultArtifactName({ ...identity, check: "typecheck", platform: "linux-x64" })).toBe(
			`trellis-ci-verification-${"a".repeat(40)}-123-2-typecheck-linux-x64`,
		);
		expect(packageArtifactName({ ...identity, platform: "linux-x64" })).toBe(
			`trellis-package-verification-${"a".repeat(40)}-123-2-linux-x64`,
		);
		expect(evidenceArtifactName(identity)).toBe(
			`trellis-evidence-verification-${"a".repeat(40)}-123-2`,
		);
	});
});
