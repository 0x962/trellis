import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps, ReactElement } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";
import { buttonVariants, disabledLook } from "../Button/variants";

export type IconButtonSize = "xs" | "sm" | "md";

export type IconButtonProps = Omit<ComponentProps<typeof BaseButton>, "children" | "className"> & {
	className?: string;
	// The accessible name. The icon has no text, so the label is the name.
	label: string;
	icon: ReactElement;
	size?: IconButtonSize;
	// True draws the button as a circle. Create and toggle controls are
	// round, so a person tells them from the square controls around them.
	round?: boolean;
	variant?: "primary" | "default" | "quiet" | "danger";
};

const sizes: Record<IconButtonSize, string> = {
	xs: `size-6 ${hitArea.box24Bordered}`,
	sm: `size-7 ${hitArea.box28Bordered}`,
	md: `size-8 ${hitArea.box32Bordered}`,
};

// A square button that shows one icon. Sizes sm and md are as tall as the
// Button sizes with the same names: sm is 28 px, for rows, bars, and
// headers, and md is 32 px, for dialogs, forms, and the create control of a
// page. Size xs is 24 px, for a row too short for 28 px. The hit-area layer
// brings every size to 28 px on a fine pointer, and the size token draws
// each at 44 px on a coarse one.
export function IconButton({
	label,
	icon,
	size = "sm",
	round = false,
	variant = "quiet",
	className,
	...props
}: IconButtonProps) {
	return (
		<BaseButton
			aria-label={label}
			className={cx(
				"inline-flex shrink-0 items-center justify-center border select-none transition duration-hover ease-out",
				round ? "rounded-round" : "rounded-md",
				"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
				buttonVariants[variant],
				disabledLook(variant),
				sizes[size],
				className,
			)}
			{...props}
		>
			<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 *:size-full">
				{icon}
			</span>
		</BaseButton>
	);
}
