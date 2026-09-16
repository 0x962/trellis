import { Button as BaseButton } from "@base-ui/react/button";
import { type ComponentProps, cloneElement, type ReactElement } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";
import { buttonVariants, disabledLook, pressedLook } from "../Button/variants";

export type IconButtonSize = "xs" | "sm" | "md";

export type IconButtonProps = Omit<ComponentProps<typeof BaseButton>, "children" | "className"> & {
	className?: string;
	// The accessible name. The icon has no text, so the label is the name.
	label: string;
	icon: ReactElement;
	size?: IconButtonSize;
	// Set only on a toggle. The button reports the state through
	// aria-pressed, and while it is on it takes the accent ring and fill.
	pressed?: boolean;
	variant?: "primary" | "default" | "quiet" | "danger";
};

const sizes: Record<IconButtonSize, string> = {
	xs: `size-6 ${hitArea.box24Bordered}`,
	sm: `size-7 ${hitArea.box28Bordered}`,
	md: `size-8 ${hitArea.box32Bordered}`,
};

// A round button that shows one icon. Every icon button in trellis is a
// circle, and an action that needs words is a Button. Sizes sm and md are as tall as the
// Button sizes with the same names: sm is 28 px, for rows, bars, and
// headers, and md is 32 px, for dialogs, forms, and the create control of a
// page. Size xs is 24 px, for a row too short for 28 px. The hit-area layer
// brings every size to 28 px on a fine pointer, and the size token draws
// each at 44 px on a coarse one.
export function IconButton({
	label,
	icon,
	size = "sm",
	pressed,
	variant = "quiet",
	className,
	...props
}: IconButtonProps) {
	return (
		<BaseButton
			aria-label={label}
			aria-pressed={pressed}
			className={cx(
				"inline-flex shrink-0 items-center justify-center rounded-round border select-none transition duration-hover ease-out",
				"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
				pressed ? pressedLook : buttonVariants[variant],
				disabledLook(variant),
				sizes[size],
				className,
			)}
			{...props}
		>
			<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 *:size-full">
				{cloneElement(icon as ReactElement<{ "aria-hidden"?: boolean }>, { "aria-hidden": true })}
			</span>
		</BaseButton>
	);
}
