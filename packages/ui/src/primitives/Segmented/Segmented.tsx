import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";

export type SegmentedOption<Value extends string> = {
	value: Value;
	label: string;
};

export type SegmentedProps<Value extends string> = {
	// The accessible name of the group.
	label: string;
	options: readonly SegmentedOption<Value>[];
	value: Value;
	onValueChange: (value: Value) => void;
	className?: string;
};

// A view switch, such as Table | Board. One option is always on; arrow keys
// move it. Each item draws its own 1 px border, so the group clips nothing.
// The hit-area layer of an item therefore reaches above and below the group.
// An item is at least 28 px wide, and 44 px on a coarse pointer. The width
// meets the minimum without a layer that would cover a neighbour. Base UI
// renders a hidden input after each item, so the end items are found by
// type, not by child position.
export function Segmented<Value extends string>({
	label,
	options,
	value,
	onValueChange,
	className,
}: SegmentedProps<Value>) {
	return (
		<RadioGroup
			aria-label={label}
			value={value}
			onValueChange={(next) => onValueChange(next as Value)}
			className={cx("inline-flex shrink-0 rounded-md", className)}
		>
			{options.map((option) => (
				<Radio.Root
					key={option.value}
					value={option.value}
					className={(state) =>
						cx(
							"inline-flex h-7 min-w-7 cursor-default items-center justify-center border-y border-border px-2.5 text-sm leading-none whitespace-nowrap select-none transition-colors duration-hover ease-out pointer-coarse:min-w-11",
							"first-of-type:rounded-l-md first-of-type:border-l last-of-type:rounded-r-md last-of-type:border-r",
							hitArea.segment28,
							"focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
							state.checked ? "bg-bg text-fg" : "bg-surface text-fg-muted hover:text-fg",
						)
					}
				>
					{option.label}
				</Radio.Root>
			))}
		</RadioGroup>
	);
}
