import { Button as BaseButton } from "@base-ui/react/button";
import { type ComponentProps, type ReactElement, type ReactNode, useId } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";
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
	// The shortcut occupies a full-height segment before the label.
	kbd?: string;
	children: ReactNode;
};

const sizes: Record<ButtonSize, string> = {
	sm: `h-7 text-sm ${hitArea.box28Bordered}`,
	md: `h-8 text-base ${hitArea.box32Bordered}`,
};

// The text button. The app has two button heights: sm is 28 px, for rows,
// bars, and headers, and md is 32 px, for dialogs, forms, and empty
// states. Both are at least 28 px wide, and the hit-area layer brings both
// to the 44 px minimum on a coarse pointer.
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
				"inline-flex min-w-7 shrink-0 items-center justify-center rounded-md border font-medium whitespace-nowrap select-none transition duration-hover ease-out",
				"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
				variant === "quiet" && kbd
					? "bg-transparent border-border text-fg-muted enabled:hover:bg-bg enabled:hover:text-fg"
					: buttonVariants[variant],
				disabledLook(variant),
				sizes[size],
				!kbd && padding,
				className,
			)}
			{...props}
		>
			{kbd && (
				<kbd
					id={shortcutId}
					className={cx(
						"inline-flex shrink-0 items-center justify-center self-stretch border-r border-inherit px-1.5 font-mono text-xs font-normal leading-none",
						size === "sm" ? "min-w-6.5" : "min-w-7.5",
					)}
				>
					{kbd}
				</kbd>
			)}
			<span
				id={labelId}
				className={cx(
					"inline-flex flex-1 items-center gap-1.5",
					align === "start" ? "justify-start" : "justify-center",
					kbd && padding,
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
