import { Separator as BaseSeparator } from "@base-ui/react/separator";
import type { ComponentPropsWithRef } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";

export function ResizeHandle({
	label,
	value,
	min,
	max,
	active = false,
	className,
	...props
}: Omit<ComponentPropsWithRef<"div">, "children"> & {
	label: string;
	value: number;
	min: number;
	max: number;
	active?: boolean;
}) {
	return (
		<BaseSeparator
			{...props}
			orientation="vertical"
			aria-label={label}
			aria-valuenow={value}
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuetext={`${value} pixels`}
			aria-disabled={min === max}
			tabIndex={min === max ? -1 : 0}
			className={cx(
				"h-full w-1 touch-none select-none cursor-col-resize transition-colors duration-hover hover:bg-accent focus-visible:bg-accent active:bg-accent",
				"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 motion-reduce:transition-none",
				"aria-disabled:pointer-events-none aria-disabled:cursor-default",
				hitArea.handle4,
				active && "bg-accent",
				className,
			)}
		/>
	);
}
