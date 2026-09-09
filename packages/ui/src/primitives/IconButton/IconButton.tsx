import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps, ReactElement } from "react";
import { cx } from "../../utils/cx";

export type IconButtonProps = Omit<ComponentProps<typeof BaseButton>, "children" | "className"> & {
	className?: string;
	// The accessible name. The icon has no text, so the label is the name.
	label: string;
	icon: ReactElement;
	size?: "sm" | "md";
	variant?: "quiet" | "default";
};

// A square button that shows one icon. 28 px at size md, 24 px at size sm.
export function IconButton({ label, icon, size = "md", variant = "quiet", className, ...props }: IconButtonProps) {
	return (
		<BaseButton
			aria-label={label}
			className={cx(
				"inline-flex shrink-0 items-center justify-center rounded-md border select-none transition duration-hover ease-out",
				"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
				"disabled:opacity-50 disabled:pointer-events-none",
				variant === "quiet"
					? "border-transparent bg-transparent text-fg-muted hover:bg-bg hover:text-fg"
					: "border-border bg-surface text-fg hover:bg-bg hover:border-border-strong",
				size === "md" ? "size-7" : "size-6",
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
