export const primaryReviewAction = ({ state, isDraft }: { state?: string; isDraft?: boolean }) => {
	if (state?.toUpperCase() !== "OPEN") return null;
	return isDraft ? "ready" : "merge";
};

export const mergeAction = (admin: boolean) => (admin ? "admin-merge" : "merge");
