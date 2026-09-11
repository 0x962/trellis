import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps, ReactElement } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";
import { buttonVariants, disabledLook } from "../Button/variants";

export type IconButtonProps = Omit<ComponentProps<typeof BaseButton>, "children" | "className"> & {
	className?: string;
	// The accessible name. The icon has no text, so the label is the name.
	label: string;
	icon: ReactElement;
	size?: "sm" | "md";
	variant?: "primary" | "default" | "quiet" | "danger";
};

// A square button that shows one icon, drawn 28 px at size md and 24 px at
// size sm. Size sm sits inside rows and headers; next to a Button in a bar
// it is md. The hit-area layer brings both sizes to the 28 px minimum on a
// fine pointer, and the size token draws both at 44 px on a coarse one.
export function IconButton({ label, icon, size = "md", variant = "quiet", className, ...props }: IconButtonProps) {
	return (
		<BaseButton
			aria-label={label}
			className={cx(
				"inline-flex shrink-0 items-center justify-center rounded-md border select-none transition duration-hover ease-out",
				"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
				buttonVariants[variant],
				disabledLook(variant),
				size === "md" ? `size-7 ${hitArea.box28Bordered}` : `size-6 ${hitArea.box24Bordered}`,
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
