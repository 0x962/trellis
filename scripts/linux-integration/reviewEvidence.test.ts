import { describe, expect, test } from "bun:test";
import { buildIntegratedCommitProof } from "./integratedCommitProof";
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
		checkpointTicketIdentifier: "TRL-550",
		checkpointTicketId: "checkpoint-ticket-id",
		diffUrl: "https://github.com/0x962/trellis/pull/523",
		reviewedHead: "43ecea683",
		sourceHead: "69926b75f",
		laneCommit: "5257adfbc",
		reviewRunId: "review-run",
		reviewResult,
		findings: [{ id: "finding", status: "resolved", resolution: "The review accepted the fix." }],
	};
}

describe("Linux integration review evidence", () => {
	test("returns false only for a valid negative ancestry result", async () => {
		const proof = await buildIntegratedCommitProof(
			{
				reviewedHead: "HEAD",
				sourceHead: "HEAD^",
				laneCommit: "HEAD^",
			},
			"HEAD^",
		);
		expect(proof.reviewedHeadInSource).toBe(false);
		expect(proof.sourceHeadInLaneCommit).toBe(true);
		expect(proof.laneCommitInWorkflowHead).toBe(true);
	});

	test("reports an invalid ancestry command with its failure details", async () => {
		expect(
			buildIntegratedCommitProof(
				{
					reviewedHead: "missing-linux-integration-reference",
					sourceHead: "HEAD",
					laneCommit: "HEAD",
				},
				"HEAD",
			),
		).rejects.toThrow(
			"The command git merge-base --is-ancestor missing-linux-integration-reference HEAD failed with exit code 128:",
		);
	});

	test("keeps reviewed, source, and lane commits as separate ancestry identities", () => {
		const input = verifyIntegratedInput(reviewedFeature(), passedProof);
		expect(input.reviewedHead).toBe("43ecea683");
		expect(input.sourceHead).toBe("69926b75f");
		expect(input.laneCommit).toBe("5257adfbc");
		expect(input.checkpointTicketIdentifier).toBe("TRL-550");
		expect(input.checkpointTicketId).toBe("checkpoint-ticket-id");
		expect(input).not.toHaveProperty("commit");
		expect(input.verification).toBe("passed");
	});

	test("keeps a running feature flow unverified", () => {
		expect(verifyIntegratedInput(reviewedFeature("running"), passedProof).verification).toBe("unverified");
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
				checkpointTicketIdentifier: "TRL-551",
				checkpointTicketId: "checkpoint-ticket-id",
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
				checkpointTicketIdentifier: "TRL-551",
				checkpointTicketId: "checkpoint-ticket-id",
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

	test("keeps a missing checkpoint ticket identity unverified", () => {
		const feature = reviewedFeature();
		feature.checkpointTicketId = "";

		expect(verifyIntegratedInput(feature, passedProof).verification).toBe("unverified");
	});

	test("keeps an empty integrated input list unverified", () => {
		expect(findIntegratedInputGaps([])).toEqual([
			{
				verification: "unverified",
				reason: "The lane plan has no integrated ticket or diff input.",
			},
		]);
	});
});
