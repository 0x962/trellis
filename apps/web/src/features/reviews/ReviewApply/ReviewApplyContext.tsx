import { createContext, useContext } from "react";

// What a suggestion widget needs from the review page: the pull request,
// the revision in view, the head a commit can land on, the batch, and the
// way to open the commit dialog.
export type ReviewApplyState = {
	pr: string;
	revisionId: string | null;
	headSha: string | null;
	prOpen: boolean;
	batch: ReadonlySet<string>;
	toggleBatch: (threadId: string) => void;
	apply: (threadIds: string[]) => void;
};

export const ReviewApplyContext = createContext<ReviewApplyState | null>(null);

export const useReviewApply = () => useContext(ReviewApplyContext);
