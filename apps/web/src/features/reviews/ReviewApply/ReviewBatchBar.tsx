import { GitCommit, X } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@trellis/ui";

// The row above the tabs while suggestions wait in the batch. Commit takes
// them all in one commit.
export function ReviewBatchBar({
	count,
	onCommit,
	onClear,
}: {
	count: number;
	onCommit: () => void;
	onClear: () => void;
}) {
	return (
		<div className="review-batch-bar" role="status">
			<span className="review-batch-bar-text">
				{count} {count === 1 ? "suggestion" : "suggestions"} in the batch
			</span>
			<Tooltip content={`Commit suggestions (${count})`}>
				<IconButton label={`Commit suggestions (${count})`} icon={<GitCommit />} variant="primary" onClick={onCommit} />
			</Tooltip>
			<Tooltip content="Clear the batch">
				<IconButton label="Clear the batch" icon={<X />} onClick={onClear} />
			</Tooltip>
		</div>
	);
}
