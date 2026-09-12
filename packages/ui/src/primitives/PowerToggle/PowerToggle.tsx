import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";

export type PowerToggleProps = Omit<
	ComponentProps<typeof BaseButton>,
	"children" | "className" | "onClick" | "onChange"
> & {
	// The accessible name. The toggle draws no text and no icon.
	label: string;
	on: boolean;
	onChange: (on: boolean) => void;
	className?: string;
};

// A round 32 px toggle with no icon: green metal while it is on and red
// metal while it is off. It reports the state through aria-pressed, so a
// screen reader hears on or off without a color.
export function PowerToggle({ label, on, onChange, className, ...props }: PowerToggleProps) {
	return (
		<BaseButton
			aria-label={label}
			aria-pressed={on}
			onClick={() => onChange(!on)}
			className={cx(
				"inline-flex size-8 shrink-0 rounded-round border select-none transition duration-hover ease-out",
				hitArea.box32Bordered,
				on ? "metal-on" : "metal-off",
				"enabled:hover:brightness-110 enabled:active:brightness-95 disabled:opacity-50",
				"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
				className,
			)}
			{...props}
		/>
	);
}
