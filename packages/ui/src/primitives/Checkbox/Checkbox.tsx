import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Field } from "@base-ui/react/field";
import { Check, Minus } from "@phosphor-icons/react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";

export type CheckboxProps = {
	label: string;
	// The label is read to assistive tech only.
	hideLabel?: boolean;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	// A parent whose children are partly checked. It reads as "mixed".
	indeterminate?: boolean;
	disabled?: boolean;
	className?: string;
	// Classes on the box itself, such as a hover-revealed opacity.
	boxClassName?: string;
};

// A 16 px box with a 1 px border and its label. Space toggles it; so does a
// click on the label. The hit-area layer around the box reaches the 28 px
// and 44 px minimums.
export function Checkbox({
	label,
	hideLabel = false,
	checked,
	onCheckedChange,
	indeterminate = false,
	disabled = false,
	className,
	boxClassName,
}: CheckboxProps) {
	return (
		<Field.Root
			disabled={disabled}
			className={cx(
				"inline-flex items-center gap-2 text-base text-fg select-none",
				disabled && "opacity-50",
				className,
			)}
		>
			<BaseCheckbox.Root
				checked={checked}
				indeterminate={indeterminate}
				onCheckedChange={(next) => onCheckedChange(next)}
				className={cx(
					"inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface text-on-accent transition-colors duration-hover ease-out",
					hitArea.box16Bordered,
					"data-checked:border-accent data-checked:bg-accent data-indeterminate:border-accent data-indeterminate:bg-accent",
					"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
					boxClassName,
				)}
			>
				<BaseCheckbox.Indicator className="inline-flex size-3 data-unchecked:hidden *:size-full">
					{indeterminate ? <Minus weight="bold" /> : <Check weight="bold" />}
				</BaseCheckbox.Indicator>
			</BaseCheckbox.Root>
			<Field.Label className={cx(hideLabel && "sr-only")}>{label}</Field.Label>
		</Field.Root>
	);
}
