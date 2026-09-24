import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import type { ReactNode } from "react";
import { cx } from "../../utils/cx";

export type ChoiceBoxesOption<Value extends string> = {
	value: Value;
	label: string;
	// A mark over the label, such as the company mark of a model. It keeps
	// its own size.
	icon?: ReactNode;
};

export type ChoiceBoxesProps<Value extends string> = {
	// The accessible name of the group.
	label: string;
	options: readonly ChoiceBoxesOption<Value>[];
	value: Value;
	onValueChange: (value: Value) => void;
	// A disabled group shows its value and takes no pick.
	disabled?: boolean;
	className?: string;
};

// A row of boxes where one is on, for a choice of four to six things that
// each carry a mark: the harness of an agent, for example. Every box takes
// the same share of the width and is 56 px tall, so a mark and a name stand
// one over the other. The arrow keys move the choice, which is how a radio
// group answers the keyboard.
//
// `ChoiceGroup` stays the shape for a choice whose options need a sentence
// each, and `Segmented` for a switch between views of one page.
export function ChoiceBoxes<Value extends string>({
	label,
	options,
	value,
	onValueChange,
	disabled = false,
	className,
}: ChoiceBoxesProps<Value>) {
	return (
		<RadioGroup
			aria-label={label}
			value={value}
			disabled={disabled}
			onValueChange={(next) => onValueChange(next as Value)}
			className={cx("flex gap-2", className)}
		>
			{options.map((option) => (
				<Radio.Root
					key={option.value}
					value={option.value}
					className={cx(
						"flex h-14 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-border bg-surface px-1 text-xs text-fg-muted select-none transition duration-hover ease-out",
						"hover:border-border-strong hover:text-fg",
						"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
						"data-checked:border-accent data-checked:bg-accent-soft data-checked:text-fg",
						"data-disabled:cursor-default data-disabled:hover:border-border data-disabled:hover:text-fg-muted",
					)}
				>
					{option.icon !== undefined && (
						<span aria-hidden="true" className="inline-flex shrink-0 items-center">
							{option.icon}
						</span>
					)}
					<span className="max-w-full truncate">{option.label}</span>
				</Radio.Root>
			))}
		</RadioGroup>
	);
}
