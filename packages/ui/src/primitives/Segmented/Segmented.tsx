import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { cx } from "../../utils/cx";

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
// move it.
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
			className={cx("inline-flex shrink-0 overflow-hidden rounded-md border border-border bg-surface", className)}
		>
			{options.map((option) => (
				<Radio.Root
					key={option.value}
					value={option.value}
					className={(state) =>
						cx(
							"inline-flex h-6.5 cursor-default items-center px-2.5 text-sm leading-none whitespace-nowrap select-none transition-colors duration-hover ease-out",
							"focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
							state.checked ? "bg-bg text-fg" : "text-fg-muted hover:text-fg",
						)
					}
				>
					{option.label}
				</Radio.Root>
			))}
		</RadioGroup>
	);
}
