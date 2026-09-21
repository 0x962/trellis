import type { ReviewSubmission } from "../schemas/review.ts";

export type VerdictFacts = Pick<ReviewSubmission, "verdict" | "headSha" | "byPerson" | "createdAt">;

// `stale` is true when the person gave the verdict on an older head commit,
// so the verdict does not cover the newest commits.
export type CurrentVerdict<T extends VerdictFacts> = { submission: T; stale: boolean };

// The current verdict of the person on a pull request is their newest
// approval or request for changes. A comment gives no verdict, and a
// submission by an agent does not count.
export const currentVerdict = <T extends VerdictFacts>(
	submissions: readonly T[],
	headSha: string | null,
): CurrentVerdict<T> | null => {
	let latest: T | null = null;
	for (const submission of submissions) {
		if (!submission.byPerson || submission.verdict === "commented") continue;
		if (latest === null || submission.createdAt > latest.createdAt) latest = submission;
	}
	if (latest === null) return null;
	return { submission: latest, stale: headSha === null || latest.headSha !== headSha };
};

// The mark of a pull request row and of the review header: the current
// verdict when it covers the head commit, or null.
export const verdictMark = (
	submissions: readonly VerdictFacts[],
	headSha: string | null,
): "approved" | "changes_requested" | null => {
	const current = currentVerdict(submissions, headSha);
	if (current === null || current.stale) return null;
	return current.submission.verdict === "approved" ? "approved" : "changes_requested";
};
