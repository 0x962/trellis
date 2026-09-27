import { describe, expect, test } from "bun:test";
import { readWorkflowIdentity } from "./checkResult";
import {
	type CheckRecord,
	evidenceArtifactName,
	expectedChecks,
	integrationBranches,
	laneForBranch,
	missingRequiredPaths,
	packageArtifactName,
	readLanePlans,
	resultArtifactName,
} from "./contract";
import {
	applyJobConclusions,
	type JobConclusions,
	verifyCheckRecord,
} from "./evidenceVerification";
import {
	findIntegratedInputGaps,
	verifyIntegratedInput,
	verifyLaneReview,
	verifyLaneReviewCoverage,
} from "./reviewEvidence";

const passedProof = {
	reviewedHeadInSource: true,
	sourceHeadInLaneCommit: true,
	laneCommitInWorkflowHead: true,
};

function reviewedFeature(reviewResult = "succeeded") {
	return {
		ticketIdentifier: "TRL-523",
		ticketId: "ticket-id",
		diffUrl: "https://github.com/0x962/trellis/pull/523",
		reviewedHead: "43ecea683",
		sourceHead: "69926b75f",
		laneCommit: "5257adfbc",
		reviewRunId: "review-run",
		reviewResult,
		findings: [{ id: "finding", status: "resolved", resolution: "The review accepted the fix." }],
	};
}

describe("Linux integration workflow contract", () => {
	test("accepts only the six integration branches", () => {
		for (const [branch, lane] of Object.entries(integrationBranches)) {
			expect(laneForBranch(branch)).toBe(lane);
		}
		expect(() => laneForBranch("trellis/trl-517-feature")).toThrow("not a Linux integration branch");
	});

	test("keeps every lane command inactive", async () => {
		const plans = await readLanePlans();
		for (const plan of Object.values(plans.lanes)) {
			expect(plan.integratedInputs).toEqual([]);
			expect(plan.focusedTests).toEqual({});
			expect(plan.packages).toEqual({});
			expect(plan.smoke).toEqual({});
			expect(plan.latitude).toEqual({});
			expect(plan.laneReview).toBeNull();
		}
	});

	test("keeps reviewed, source, and lane commits as separate ancestry identities", () => {
		const input = verifyIntegratedInput(reviewedFeature(), passedProof);
		expect(input.reviewedHead).toBe("43ecea683");
		expect(input.sourceHead).toBe("69926b75f");
		expect(input.laneCommit).toBe("5257adfbc");
		expect(input).not.toHaveProperty("commit");
		expect(input.verification).toBe("passed");
	});

	test("keeps a running feature flow unverified", () => {
		expect(verifyIntegratedInput(reviewedFeature("running"), passedProof).verification).toBe(
			"unverified",
		);
	});

	test("fails a succeeded feature flow with an open finding", () => {
		const feature = reviewedFeature();
		feature.findings[0] = {
			id: "finding",
			status: "open",
			resolution: "Unresolved.",
		};
		expect(verifyIntegratedInput(feature, passedProof).verification).toBe("failed");
	});

	test("keeps missing feature review fields unverified", () => {
		const input = verifyIntegratedInput(
			{
				ticketIdentifier: "TRL-513",
				ticketId: "ticket-id",
				diffUrl: "https://github.com/0x962/trellis/pull/495",
				sourceHead: "source",
				laneCommit: "lane",
				findings: [],
			},
			{ ...passedProof, reviewedHeadInSource: null },
		);
		expect(input.verification).toBe("unverified");
	});

	test("keeps a feature result independent from lane review evidence", () => {
		const feature = verifyIntegratedInput(reviewedFeature(), passedProof);
		const laneReview = verifyLaneReview(
			{
				diffUrl: "https://github.com/0x962/trellis/pull/600",
				reviewedHead: "lane-reviewed",
				sourceHead: "lane-source",
				laneCommit: "lane-commit",
				reviewRunId: "lane-run",
				reviewResult: "failed",
				findings: [],
			},
			passedProof,
		);
		expect(feature.verification).toBe("passed");
		expect(laneReview?.verification).toBe("failed");
	});

	test("does not upgrade a missing feature flow with lane review coverage", () => {
		const feature = verifyIntegratedInput(
			{
				ticketIdentifier: "TRL-513",
				ticketId: "ticket-id",
				diffUrl: "https://github.com/0x962/trellis/pull/495",
				sourceHead: "feature-source",
				laneCommit: "lane-commit",
				findings: [],
			},
			{ ...passedProof, reviewedHeadInSource: null },
		);
		const laneReview = verifyLaneReview(
			{
				diffUrl: "https://github.com/0x962/trellis/pull/600",
				reviewedHead: "lane-reviewed",
				sourceHead: "lane-source",
				laneCommit: "lane-commit",
				reviewRunId: "lane-run",
				reviewResult: "succeeded",
				findings: [],
			},
			passedProof,
		);
		expect(verifyLaneReviewCoverage(laneReview, true)?.verification).toBe("passed");
		expect(feature.verification).toBe("unverified");
	});

	test("keeps an empty integrated input list unverified", () => {
		expect(findIntegratedInputGaps([])).toEqual([
			{
				verification: "unverified",
				reason: "The lane plan has no integrated ticket or diff input.",
			},
		]);
	});

	test("rejects a missing workflow commit", () => {
		expect(() =>
			readWorkflowIdentity({
				GITHUB_REPOSITORY: "0x962/trellis",
				GITHUB_WORKFLOW: "Linux host integration",
				GITHUB_REF: "refs/heads/integration/linux-verification",
				GITHUB_REF_NAME: "integration/linux-verification",
				GITHUB_RUN_ID: "123",
				GITHUB_RUN_ATTEMPT: "1",
			}),
		).toThrow("GITHUB_SHA");
	});

	test("rejects a record from the wrong runner architecture", () => {
		const expected = expectedChecks.find(
			(check) => check.check === "typecheck" && check.platform === "linux-arm64",
		)!;
		const identity = {
			repository: "0x962/trellis",
			workflow: "Linux host integration",
			ref: "refs/heads/integration/linux-verification",
			branch: "integration/linux-verification",
			commit: "a".repeat(40),
			runId: "123",
			runAttempt: "1",
			lane: "verification" as const,
		};
		const record: CheckRecord = {
			schemaVersion: 1,
			...identity,
			check: expected.check,
			platform: expected.platform,
			runner: expected.runner,
			os: expected.os,
			architecture: "x64",
			command: "bun run typecheck",
			result: "passed",
			artifactName: resultArtifactName({ ...identity, check: expected.check, platform: expected.platform }),
			createdAt: "2026-09-27T00:00:00.000Z",
		};
		expect(verifyCheckRecord(record, expected, identity).result).toBe("failed");
	});

	test("fails passed package records when the package job fails", () => {
		const record = { check: "package", result: "passed" } as CheckRecord;
		const conclusions: JobConclusions = {
			plan: "success",
			lint: "success",
			typecheck: "success",
			focusedTests: "success",
			package: "failure",
			smoke: "success",
			latitude: "success",
		};
		expect(applyJobConclusions([record], conclusions)[0]?.result).toBe("failed");
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
