import { Checkbox, cx } from "@trellis/ui";

export type SelectCellProps = {
	identifier: string;
	selected: boolean;
	// True while any row is selected: every checkbox then stays visible.
	selecting: boolean;
	onToggle?: () => void;
};

// The checkbox of a row. It shows on hover, on focus, and while a
// selection exists.
export function SelectCell({ identifier, selected, selecting, onToggle }: SelectCellProps) {
	return (
		<Checkbox
			label={`Select ${identifier}`}
			hideLabel
			checked={selected}
			onCheckedChange={() => onToggle?.()}
			boxClassName={cx(
				"transition-opacity duration-hover",
				!selecting &&
					"opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 group-data-focused/row:opacity-100",
			)}
		/>
	);
}
