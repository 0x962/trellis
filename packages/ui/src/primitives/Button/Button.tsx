import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps, ReactElement, ReactNode } from "react";
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
	// A lucide icon element. It sits before the text at 14 px.
	icon?: ReactElement;
	// The key that triggers the action. It sits after the text as a Kbd.
	kbd?: string;
	children: ReactNode;
};

const sizes: Record<ButtonSize, string> = {
	sm: `h-7 px-2.5 text-sm ${hitArea.box28Bordered}`,
	md: `h-8 px-3 text-base ${hitArea.box32Bordered}`,
};

// The text button. The app has two button heights: sm is 28 px, for rows,
// bars, and headers, and md is 32 px, for dialogs, forms, and empty
// states. Both are at least 28 px wide, and the hit-area layer brings both
// to the 44 px minimum on a coarse pointer.
export function Button({ variant = "default", size = "sm", icon, kbd, className, children, ...props }: ButtonProps) {
	return (
		<BaseButton
			className={cx(
				"inline-flex min-w-7 shrink-0 items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap select-none transition duration-hover ease-out",
				"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
				buttonVariants[variant],
				disabledLook(variant),
				sizes[size],
				className,
			)}
			{...props}
		>
			{icon && (
				<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 *:size-full">
					{icon}
				</span>
			)}
			<span>{children}</span>
			{kbd && (
				<>
					{" "}
					<Kbd className="ml-0.5">{kbd}</Kbd>
				</>
			)}
		</BaseButton>
	);
}
