export const unmetLine = (unmetConditions: readonly string[]) =>
	unmetConditions.length === 0 ? null : `not yet: ${unmetConditions.join(" · ")}`;

export const mergeQuestion = (unmetConditions: readonly string[]) => {
	if (unmetConditions.length === 0) return "Merge this pull request?";
	return `Merge with ${unmetConditions.length} ${unmetConditions.length === 1 ? "condition" : "conditions"} unmet?`;
};
