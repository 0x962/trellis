import { type Conditions, unmetConditions } from "../../../../conditionLines/conditionLines";

// The one line that the shut facts strip prints. It answers the question the
// reader has before they read the code: can this pull request merge, and if
// not, what stops it. `conditions` is null while Trellis has not read the
// changed files of the pull request, and the line then says so.
export function factsLine(conditions: Conditions | null): string {
	if (conditions === null) return "conditions loading";
	if (conditions.merged) return "merged";
	const unmet = unmetConditions(conditions);
	return unmet.length === 0 ? "ready to merge" : unmet.join(" · ");
}
