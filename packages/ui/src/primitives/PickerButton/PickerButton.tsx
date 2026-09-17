import { Button as BaseButton } from "@base-ui/react/button";
import { CaretDown } from "@phosphor-icons/react";
import type { ComponentProps } from "react";
import { cx } from "../../utils/cx";

type PickerButtonProps = Omit<ComponentProps<typeof BaseButton>, "className"> & {
	label: string;
	className?: string;
	size?: "sm" | "md";
};

export function PickerButton({ label, children, className, size = "md", ...props }: PickerButtonProps) {
	return (
		<BaseButton
			aria-label={label}
			className={cx(
				"inline-flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 text-fg pointer-coarse:h-11",
				size === "sm" ? "h-7 text-sm" : "h-8 text-base",
				"hover:border-border-strong active:bg-control-active focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-soft outline-none disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<span className="min-w-0 truncate">{children}</span>
			<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 text-fg-muted *:size-full">
				<CaretDown />
			</span>
		</BaseButton>
	);
}
