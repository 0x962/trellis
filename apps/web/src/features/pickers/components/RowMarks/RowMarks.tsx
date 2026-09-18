import { Check, Minus } from "@phosphor-icons/react";
import { cx } from "@trellis/ui";

export type RowMarksProps = {
	// True on the value the field holds now. "mixed" means the picker writes
	// to several tickets and only some of them hold this value.
	current: boolean | "mixed";
	// The key that picks the row, such as "1".
	keyLabel?: string;
	// True when the row also shows a hint on its right edge. The marks then
	// follow the hint. The option always draws a hint box, empty or not, so
	// the marks take the last place in the row either way.
	afterHint?: boolean;
};

// The marks on the right of a picker row: a check on the current value, a
// minus on a mixed one, and the key cap of the key that picks the row. CSS
// draws the key from `data-key`, and the marks are hidden from assistive
// tech, so the text and the accessible name of the row stay its label.
export function RowMarks({ current, keyLabel, afterHint = false }: RowMarksProps) {
	return (
		<span
			aria-hidden="true"
			className={cx("flex shrink-0 items-center gap-2", afterHint ? "order-last ml-2" : "order-last ml-auto")}
		>
			{current === "mixed" && <Minus data-current-mark="" className="size-3.5 text-fg-muted" />}
			{current === true && <Check data-current-mark="" className="size-3.5 text-fg-muted" />}
			{keyLabel !== undefined && (
				<span
					data-key={keyLabel}
					className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-sm border border-border-strong bg-surface px-1 text-xs leading-none text-fg-muted before:content-[attr(data-key)]"
				/>
			)}
		</span>
	);
}
