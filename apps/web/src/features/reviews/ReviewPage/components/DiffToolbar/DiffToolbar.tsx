import { Segmented } from "@trellis/ui";
export function DiffToolbar({
	mode,
	onMode,
}: {
	mode: "split" | "unified";
	onMode: (value: "split" | "unified") => void;
}) {
	return (
		<div className="review-diff-toolbar">
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
