import { Button as BaseButton } from "@base-ui/react/button";
import { CaretDown } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../utils/cx";

type PickerButtonProps = Omit<ComponentProps<typeof BaseButton>, "className"> & {
	label: string;
	leading?: ReactNode;
	className?: string;
	size?: "sm" | "md";
};

export function PickerButton({ label, leading, children, className, size = "md", ...props }: PickerButtonProps) {
	return (
		<BaseButton
			aria-label={props["aria-labelledby"] ? undefined : label}
			className={cx(
				"inline-flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 text-sm text-fg pointer-coarse:h-11",
				size === "sm" ? "h-7" : "h-8",
				"hover:border-border-strong active:bg-control-active focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-soft outline-none disabled:opacity-50",
				className,
			)}
			{...props}
		>
			{leading && (
				<span aria-hidden="true" className="inline-flex shrink-0 items-center">
					{leading}
				</span>
			)}
			<span className="min-w-0 flex-1 truncate text-left">{children}</span>
			<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 text-fg-muted *:size-full">
				<CaretDown />
			</span>
		</BaseButton>
	);
}
