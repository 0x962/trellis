import { Power } from "@phosphor-icons/react";
import { IconButton, type IconButtonProps } from "../IconButton";

export type PowerToggleProps = Omit<IconButtonProps, "icon" | "pressed" | "onClick" | "onChange"> & {
	on: boolean;
	onChange: (on: boolean) => void;
};

export function PowerToggle({ on, onChange, ...props }: PowerToggleProps) {
	return (
		<IconButton
			variant="default"
			icon={<Power weight={on ? "fill" : "regular"} />}
			pressed={on}
			onClick={() => onChange(!on)}
			{...props}
		/>
	);
}
