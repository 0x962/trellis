import type {
	IntegratedCommitProof,
	IntegratedInputPlan,
	LaneReviewPlan,
} from "./reviewEvidence";

async function isAncestor(ancestor: string, descendant: string): Promise<boolean> {
	const command = ["git", "merge-base", "--is-ancestor", ancestor, descendant];
	const process = Bun.spawn(command, {
		stdout: "ignore",
		stderr: "pipe",
	});
	const [exitCode, stderr] = await Promise.all([
		process.exited,
		new Response(process.stderr).text(),
	]);
	if (exitCode === 0) return true;
	if (exitCode === 1) return false;
	throw new Error(
		`The command ${command.join(" ")} failed with exit code ${exitCode}: ${stderr.trim()}`,
	);
}

export async function buildIntegratedCommitProof(
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

export async function buildLaneReviewCoverageProof(
	input: IntegratedInputPlan,
	laneReview: LaneReviewPlan | null,
): Promise<boolean | null> {
	if (!input.sourceHead || !laneReview?.reviewedHead) return null;
	return isAncestor(input.sourceHead, laneReview.reviewedHead);
}
