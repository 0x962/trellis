import type { ReviewSubmission } from "../schemas/review.ts";

export type VerdictFacts = Pick<ReviewSubmission, "verdict" | "byPerson" | "createdAt">;

// The current verdict of the person on a pull request is their newest
// approval or request for changes. A comment gives no verdict, and a
// submission by an agent does not count.
export const currentVerdict = <T extends VerdictFacts>(submissions: readonly T[]): T | null => {
	let latest: T | null = null;
	for (const submission of submissions) {
		if (!submission.byPerson || submission.verdict === "commented") continue;
		if (latest === null || submission.createdAt > latest.createdAt) latest = submission;
	}
	return latest;
};

// The mark of a pull request row and of the review header.
export const verdictMark = (submissions: readonly VerdictFacts[]): "approved" | "changes_requested" | null => {
	const current = currentVerdict(submissions);
	if (current === null) return null;
	return current.verdict === "approved" ? "approved" : "changes_requested";
};
