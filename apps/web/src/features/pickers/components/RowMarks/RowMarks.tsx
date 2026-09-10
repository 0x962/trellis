import { cx } from "@trellis/ui";
import { Check } from "lucide-react";

export type RowMarksProps = {
	// True on the value the field holds now.
	current: boolean;
	// The key that picks the row, such as "1".
	keyLabel?: string;
	// True when the row also shows a hint on its right edge. The marks then
	// follow the hint.
	afterHint?: boolean;
};

// The marks on the right of a picker row: a check on the current value and
// the key cap of the key that picks the row. CSS draws the key from
// `data-key`, and the marks are hidden from assistive tech, so the text and
// the accessible name of the row stay its label.
export function RowMarks({ current, keyLabel, afterHint = false }: RowMarksProps) {
	return (
		<span
			aria-hidden="true"
			className={cx("flex shrink-0 items-center gap-2", afterHint ? "order-last ml-2" : "ml-auto")}
		>
			{current && <Check data-current-mark="" className="size-3.5 text-fg-muted" />}
			{keyLabel !== undefined && (
				<span
					data-key={keyLabel}
					className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-sm border border-border-strong bg-surface px-1 font-mono text-xs leading-none text-fg-muted before:content-[attr(data-key)]"
				/>
			)}
		</span>
	);
}
