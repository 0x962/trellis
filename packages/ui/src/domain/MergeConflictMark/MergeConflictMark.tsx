import { AlertIcon } from "@primer/octicons-react";
import { Tooltip } from "../../primitives/Tooltip";

export type MergeConflictMarkProps = {
	// The branch the pull request merges into.
	baseRef: string;
};

// The mark of a pull request that GitHub cannot merge into its base branch.
// It is the Octicons alert triangle, the icon GitHub shows beside "This
// branch has conflicts that must be resolved".
export function MergeConflictMark({ baseRef }: MergeConflictMarkProps) {
	const label = `Merge conflict with ${baseRef}`;
	return (
		<Tooltip content={label}>
			<span data-pr-conflict="" role="img" aria-label={label} className="inline-flex shrink-0 text-warning">
				<AlertIcon size={14} aria-hidden={true} />
			</span>
		</Tooltip>
	);
}
