import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { cx } from "../../utils/cx";

export type ChoiceGroupOption<Value extends string> = {
	value: Value;
	label: string;
	description: string;
};

export type ChoiceGroupProps<Value extends string> = {
	label: string;
	options: readonly ChoiceGroupOption<Value>[];
	value: Value;
	onValueChange: (value: Value) => void;
	// A disabled group shows its value and takes no pick.
	disabled?: boolean;
	className?: string;
};

export function ChoiceGroup<Value extends string>({
	label,
	options,
	value,
	onValueChange,
	disabled = false,
	className,
}: ChoiceGroupProps<Value>) {
	return (
		<RadioGroup
			aria-label={label}
			value={value}
			disabled={disabled}
			onValueChange={(next) => onValueChange(next as Value)}
			className={cx("flex flex-col gap-1", className)}
		>
			{options.map((option) => (
				<Radio.Root
					key={option.value}
					value={option.value}
					className="group flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-3 py-2 text-start transition-colors duration-hover hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 data-checked:bg-surface data-disabled:cursor-default data-disabled:hover:bg-transparent data-disabled:data-checked:hover:bg-surface"
				>
					<span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-round border border-border-strong text-accent group-data-checked:border-accent">
						<Radio.Indicator className="size-2 rounded-round bg-current data-unchecked:hidden" />
					</span>
					<span className="flex min-w-0 flex-col">
						<span className="text-sm font-medium text-fg">{option.label}</span>
						<span className="text-xs leading-4.5 text-fg-muted">{option.description}</span>
					</span>
				</Radio.Root>
			))}
		</RadioGroup>
	);
}
