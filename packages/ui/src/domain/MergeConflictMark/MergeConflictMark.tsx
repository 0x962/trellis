import { ArrowsSplit } from "@phosphor-icons/react";
import { Tooltip } from "../../primitives/Tooltip";

export type MergeConflictMarkSize = "sm" | "md";

export type MergeConflictMarkProps = {
	// The branch the pull request merges into.
	baseRef: string;
	size?: MergeConflictMarkSize;
};

// A table row is 32 px tall and holds the small glyph. A pull request row and
// the review heading have more room and hold the medium one.
const pixelSizes: Record<MergeConflictMarkSize, number> = { sm: 14, md: 16 };

// The mark of a pull request that GitHub cannot merge into its base branch.
// The Phosphor ArrowsSplit glyph is one stem that forks into two arrows, which
// says the pull request and its base branch went different ways. The colour is
// text-warning, which in this app means a person must act.
export function MergeConflictMark({ baseRef, size = "sm" }: MergeConflictMarkProps) {
	const label = `Merge conflict with ${baseRef}`;
	return (
		<Tooltip content={label}>
			<span data-pr-conflict="" role="img" aria-label={label} className="inline-flex shrink-0 text-warning">
				<ArrowsSplit size={pixelSizes[size]} aria-hidden={true} />
			</span>
		</Tooltip>
	);
}
