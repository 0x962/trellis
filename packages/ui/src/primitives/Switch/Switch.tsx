import { Field } from "@base-ui/react/field";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";

export type SwitchProps = {
	label: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	disabled?: boolean;
	className?: string;
};

// An on/off toggle with its label. Space and Enter flip it; so does a click
// on the label. The track is 28 by 16 px; the hit-area layer around it
// reaches the 28 px and 44 px minimums.
export function Switch({ label, checked, onCheckedChange, disabled = false, className }: SwitchProps) {
	return (
		<Field.Root
			disabled={disabled}
			className={cx(
				"inline-flex items-center gap-2 text-base text-fg select-none",
				disabled && "opacity-50",
				className,
			)}
		>
			<BaseSwitch.Root
				checked={checked}
				onCheckedChange={(next) => onCheckedChange(next)}
				className={cx(
					"inline-flex h-4 w-7 shrink-0 items-center rounded-xl bg-border-strong p-0.5 transition-colors duration-hover ease-out",
					hitArea.box16,
					"data-checked:bg-accent",
					"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
				)}
			>
				<BaseSwitch.Thumb className="size-3 rounded-full bg-surface shadow-sm transition-transform duration-hover ease-out data-checked:translate-x-3" />
			</BaseSwitch.Root>
			<Field.Label>{label}</Field.Label>
		</Field.Root>
	);
}
