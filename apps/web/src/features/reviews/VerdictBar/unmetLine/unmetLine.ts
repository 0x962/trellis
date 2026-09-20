// The line under the verdict bar, and the question that the merge confirm
// asks. Both take the phrases of `unmetConditions`, so the bar names the same
// conditions that make the conditions block read "not yet".

// "not yet: 1 check failed · 1 of 4 evidence", or null when every condition
// is met.
export const unmetLine = (unmet: readonly string[]) => (unmet.length === 0 ? null : `not yet: ${unmet.join(" · ")}`);

export const mergeQuestion = (unmet: readonly string[]) => {
	if (unmet.length === 0) return "Merge this pull request?";
	return `Merge with ${unmet.length} ${unmet.length === 1 ? "condition" : "conditions"} unmet?`;
};
