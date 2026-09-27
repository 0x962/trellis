import type {
	IntegratedCommitProof,
	IntegratedInputPlan,
	LaneReviewPlan,
} from "./reviewEvidence";

async function isAncestor(ancestor: string, descendant: string): Promise<boolean> {
	const process = Bun.spawn(["git", "merge-base", "--is-ancestor", ancestor, descendant], {
		stdout: "ignore",
		stderr: "ignore",
	});
	return (await process.exited) === 0;
}

export async function readIntegratedCommitProof(
	input: IntegratedInputPlan | LaneReviewPlan | null,
	workflowHead: string,
): Promise<IntegratedCommitProof> {
	const [reviewedHeadInSource, sourceHeadInLaneCommit, laneCommitInWorkflowHead] = await Promise.all([
		input?.reviewedHead && input.sourceHead
			? isAncestor(input.reviewedHead, input.sourceHead)
			: null,
		input?.sourceHead && input.laneCommit
			? isAncestor(input.sourceHead, input.laneCommit)
			: null,
		input?.laneCommit ? isAncestor(input.laneCommit, workflowHead) : null,
	]);
	return {
		reviewedHeadInSource,
		sourceHeadInLaneCommit,
		laneCommitInWorkflowHead,
	};
}

export async function readLaneReviewCoverageProof(
	input: IntegratedInputPlan,
	laneReview: LaneReviewPlan | null,
): Promise<boolean | null> {
	if (!input.sourceHead || !laneReview?.reviewedHead) return null;
	return isAncestor(input.sourceHead, laneReview.reviewedHead);
}
