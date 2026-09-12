import { List } from "@phosphor-icons/react";
import { IconButton, Segmented, Tooltip } from "@trellis/ui";
export function DiffToolbar({
	count,
	visibleCount,
	mode,
	onMode,
	onFiles,
}: {
	count: number;
	visibleCount: number;
	mode: "split" | "unified";
	onMode: (value: "split" | "unified") => void;
	onFiles: () => void;
}) {
	return (
		<div className="review-diff-toolbar">
			<Tooltip content="Changed files">
				<IconButton className="review-mobile-files" label="Changed files" icon={<List />} onClick={onFiles} />
			</Tooltip>
			<span className="review-meta">
				{visibleCount === count ? count : `${visibleCount} of ${count}`} {count === 1 ? "file" : "files"}
			</span>
			<Segmented
				label="Diff layout"
				value={mode}
				options={[
					{ value: "unified", label: "Unified" },
					{ value: "split", label: "Split" },
				]}
				onValueChange={onMode}
			/>
		</div>
	);
}
