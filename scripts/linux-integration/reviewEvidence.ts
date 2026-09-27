import type { Result } from "./contract";

type FindingPlan = {
	id?: string;
	status?: string;
	resolution?: string;
};

export type IntegratedInputPlan = {
	ticketIdentifier?: string;
	ticketId?: string;
	checkpointTicketIdentifier: string;
	checkpointTicketId: string;
	diffUrl?: string;
	reviewedHead?: string;
	sourceHead?: string;
	laneCommit?: string;
	reviewRunId?: string;
	reviewResult?: string;
	findings?: FindingPlan[];
	reviewWaiver?: string;
};

export type LaneReviewPlan = {
	diffUrl?: string;
	reviewedHead?: string;
	sourceHead?: string;
	laneCommit?: string;
	reviewRunId?: string;
	reviewResult?: string;
	findings?: FindingPlan[];
};

export type IntegratedCommitProof = {
	reviewedHeadInSource: boolean | null;
	sourceHeadInLaneCommit: boolean | null;
	laneCommitInWorkflowHead: boolean | null;
};

type LaneReviewCoverage = {
	featureSourceInLaneReviewedHead: boolean | null;
	verification: Result;
	reason?: string;
};

type IntegratedInputEvidence = {
	ticketIdentifier: string;
	ticketId: string;
	checkpointTicketIdentifier: string;
	checkpointTicketId: string;
	diffUrl: string;
	reviewedHead: string;
	sourceHead: string;
	laneCommit: string;
	reviewRunId: string;
	reviewResult: string;
	reviewWaiver: string;
	findings: Array<{
		id: string;
		status: string;
		resolution: string;
	}>;
	commitProof: IntegratedCommitProof;
	laneReviewCoverage: LaneReviewCoverage | null;
	verification: Result;
	reason?: string;
};

type LaneReviewEvidence = {
	diffUrl: string;
	reviewedHead: string;
	sourceHead: string;
	laneCommit: string;
	reviewRunId: string;
	reviewResult: string;
	findings: Array<{
		id: string;
		status: string;
		resolution: string;
	}>;
	commitProof: IntegratedCommitProof;
	verification: Result;
	reason?: string;
};

type IntegrationGap = {
	verification: Exclude<Result, "passed">;
	reason: string;
};

export function verifyIntegratedInput(
	input: IntegratedInputPlan,
	commitProof: IntegratedCommitProof,
): IntegratedInputEvidence {
	const findings = (input.findings ?? []).map((finding) => ({
		id: finding.id ?? "",
		status: finding.status ?? "",
		resolution: finding.resolution ?? "",
	}));
	const required = [
		input.ticketIdentifier,
		input.ticketId,
		input.checkpointTicketIdentifier,
		input.checkpointTicketId,
		input.diffUrl,
		input.reviewedHead,
		input.sourceHead,
		input.laneCommit,
		input.reviewRunId,
		input.reviewResult,
	];
	const missingFindingField = findings.some(
		(finding) => !finding.id || !finding.status || !finding.resolution,
	);
	let verification: Result = "passed";
	let reason: string | undefined;
	if (required.some((value) => !value) || !input.findings || missingFindingField) {
		verification = "unverified";
		reason = "The integrated input has a missing required field.";
	} else if (["running", "pending", "queued"].includes(input.reviewResult ?? "")) {
		verification = "unverified";
		reason = `The saved Trellis feature flow is ${input.reviewResult}.`;
	} else if (input.reviewResult !== "succeeded") {
		verification = "failed";
		reason = "The saved Trellis flow did not succeed.";
	} else if (findings.some((finding) => finding.status !== "resolved")) {
		verification = "failed";
		reason = "The review has an unresolved finding.";
	} else if (commitProof.reviewedHeadInSource === null) {
		verification = "unverified";
		reason = "The feature review has no reviewed-head ancestry proof.";
	} else if (!commitProof.reviewedHeadInSource) {
		verification = "failed";
		reason = "The reviewed head is not an ancestor of the source head.";
	} else if (!commitProof.sourceHeadInLaneCommit) {
		verification = "failed";
		reason = "The source head is not an ancestor of the lane commit.";
	} else if (!commitProof.laneCommitInWorkflowHead) {
		verification = "failed";
		reason = "The lane commit is not an ancestor of the workflow head.";
	}
	return {
		ticketIdentifier: input.ticketIdentifier ?? "",
		ticketId: input.ticketId ?? "",
		checkpointTicketIdentifier: input.checkpointTicketIdentifier ?? "",
		checkpointTicketId: input.checkpointTicketId ?? "",
		diffUrl: input.diffUrl ?? "",
		reviewedHead: input.reviewedHead ?? "",
		sourceHead: input.sourceHead ?? "",
		laneCommit: input.laneCommit ?? "",
		reviewRunId: input.reviewRunId ?? "",
		reviewResult: input.reviewResult ?? "",
		reviewWaiver: input.reviewWaiver ?? "",
		findings,
		commitProof,
		laneReviewCoverage: null,
		verification,
		reason,
	};
}

export function verifyLaneReview(
	input: LaneReviewPlan | null,
	commitProof: IntegratedCommitProof,
): LaneReviewEvidence | null {
	if (!input) return null;
	const findings = (input.findings ?? []).map((finding) => ({
		id: finding.id ?? "",
		status: finding.status ?? "",
		resolution: finding.resolution ?? "",
	}));
	const required = [
		input.diffUrl,
		input.reviewedHead,
		input.sourceHead,
		input.laneCommit,
		input.reviewRunId,
		input.reviewResult,
	];
	let verification: Result = "passed";
	let reason: string | undefined;
	if (required.some((value) => !value) || !input.findings) {
		verification = "unverified";
		reason = "The lane review has a missing required field.";
	} else if (findings.some((finding) => !finding.id || !finding.status || !finding.resolution)) {
		verification = "unverified";
		reason = "The lane review has a finding with a missing required field.";
	} else if (["running", "pending", "queued"].includes(input.reviewResult ?? "")) {
		verification = "unverified";
		reason = `The saved Trellis lane flow is ${input.reviewResult}.`;
	} else if (input.reviewResult !== "succeeded") {
		verification = "failed";
		reason = "The saved Trellis lane flow did not succeed.";
	} else if (findings.some((finding) => finding.status !== "resolved")) {
		verification = "failed";
		reason = "The lane review has an unresolved finding.";
	} else if (Object.values(commitProof).some((value) => value === null)) {
		verification = "unverified";
		reason = "The lane review has incomplete commit ancestry proof.";
	} else if (!commitProof.reviewedHeadInSource) {
		verification = "failed";
		reason = "The lane review head is not an ancestor of its source head.";
	} else if (!commitProof.sourceHeadInLaneCommit) {
		verification = "failed";
		reason = "The lane review source head is not an ancestor of the lane commit.";
	} else if (!commitProof.laneCommitInWorkflowHead) {
		verification = "failed";
		reason = "The reviewed lane commit is not an ancestor of the workflow head.";
	}
	return {
		diffUrl: input.diffUrl ?? "",
		reviewedHead: input.reviewedHead ?? "",
		sourceHead: input.sourceHead ?? "",
		laneCommit: input.laneCommit ?? "",
		reviewRunId: input.reviewRunId ?? "",
		reviewResult: input.reviewResult ?? "",
		findings,
		commitProof,
		verification,
		reason,
	};
}

export function verifyLaneReviewCoverage(
	laneReview: LaneReviewEvidence | null,
	featureSourceInLaneReviewedHead: boolean | null,
): LaneReviewCoverage | null {
	if (!laneReview) return null;
	if (laneReview.verification !== "passed") {
		return {
			featureSourceInLaneReviewedHead,
			verification: laneReview.verification,
			reason: laneReview.reason,
		};
	}
	if (featureSourceInLaneReviewedHead === null) {
		return {
			featureSourceInLaneReviewedHead,
			verification: "unverified",
			reason: "The feature source has no lane review coverage proof.",
		};
	}
	if (!featureSourceInLaneReviewedHead) {
		return {
			featureSourceInLaneReviewedHead,
			verification: "failed",
			reason: "The feature source is not an ancestor of the lane review head.",
		};
	}
	return { featureSourceInLaneReviewedHead, verification: "passed" };
}

export function findIntegratedInputGaps(inputs: IntegratedInputEvidence[]): IntegrationGap[] {
	if (inputs.length > 0) return [];
	return [
		{
			verification: "unverified",
			reason: "The lane plan has no integrated ticket or diff input.",
		},
	];
}
