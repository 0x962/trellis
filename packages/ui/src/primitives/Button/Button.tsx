import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";
import { Kbd } from "../Kbd";

export type ButtonVariant = "primary" | "default" | "quiet" | "danger";
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

const variants: Record<ButtonVariant, string> = {
	default: "bg-surface border-border text-fg hover:bg-bg hover:border-border-strong",
	primary: "bg-accent border-accent text-on-accent hover:brightness-105",
	quiet: "bg-transparent border-transparent text-fg-muted hover:bg-bg hover:text-fg",
	danger: "bg-danger border-danger text-on-accent hover:brightness-105",
};

const sizes: Record<ButtonSize, string> = {
	md: `h-7 px-2.5 text-sm ${hitArea[28]}`,
	sm: `h-6 px-2 text-xs ${hitArea[24]}`,
};

// The text button, drawn 28 px tall at size md and 24 px at size sm. The
// hit-area layer brings both sizes to the 28 px and 44 px minimums.
export function Button({ variant = "default", size = "md", icon, kbd, className, children, ...props }: ButtonProps) {
	const onFill = variant === "primary" || variant === "danger";
	return (
		<BaseButton
			className={cx(
				"inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap select-none transition duration-hover ease-out",
				"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
				"disabled:opacity-50 disabled:pointer-events-none",
				variants[variant],
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
					<Kbd tone={onFill ? "inverse" : "default"} className="ml-0.5">
						{kbd}
					</Kbd>
				</>
			)}
		</BaseButton>
	);
}
