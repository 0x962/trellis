import { Button as BaseButton } from "@base-ui/react/button";
import { type ComponentProps, type ReactElement, type ReactNode, useId } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";
import { Kbd } from "../Kbd";
import { type ButtonVariant, buttonVariants, disabledLook } from "./variants";

export type { ButtonVariant } from "./variants";
export type ButtonSize = "sm" | "md";

export type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "children" | "className"> & {
	className?: string;
	variant?: ButtonVariant;
	size?: ButtonSize;
	align?: "center" | "start";
	// A lucide icon element. It sits before the text at 14 px.
	icon?: ReactElement;
	// The shortcut, drawn as a Kbd key cap before the icon and the label. A
	// key cap is the same element here, in a row, and in a menu.
	kbd?: string;
	children: ReactNode;
};

const sizes: Record<ButtonSize, string> = {
	sm: `h-7 text-sm ${hitArea.box28Bordered}`,
	md: `h-8 text-base ${hitArea.box32Bordered}`,
};

// The text button. The app has two button heights: sm is 28 px, for rows,
// bars, and headers, and md is 32 px, for dialogs, forms, and empty
// states. Both are at least 28 px wide. On a coarse pointer the size token
// draws both at 44 px in both axes, so a tap on the edge of one button
// never lands on the one beside it.
export function Button({
	variant = "default",
	size = "sm",
	align = "center",
	icon,
	kbd,
	className,
	children,
	...props
}: ButtonProps) {
	const id = useId();
	const labelId = `${id}-label`;
	const shortcutId = `${id}-shortcut`;
	const padding = size === "sm" ? "px-2.5" : "px-3";

	return (
		<BaseButton
			aria-labelledby={kbd && !props["aria-label"] ? `${labelId} ${shortcutId}` : undefined}
			className={cx(
				"inline-flex min-w-7 shrink-0 items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap select-none transition duration-hover ease-out",
				"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
				buttonVariants[variant],
				disabledLook(variant),
				sizes[size],
				padding,
				className,
			)}
			{...props}
		>
			{kbd && (
				<Kbd id={shortcutId} className="shrink-0">
					{kbd}
				</Kbd>
			)}
			<span
				id={labelId}
				className={cx(
					"inline-flex flex-1 items-center gap-1.5",
					align === "start" ? "justify-start" : "justify-center",
				)}
			>
				{icon && (
					<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 *:size-full">
						{icon}
					</span>
				)}
				<span>{children}</span>
			</span>
		</BaseButton>
	);
}
