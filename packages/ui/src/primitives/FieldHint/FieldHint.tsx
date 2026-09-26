import type { ComponentProps } from "react";
import { cx } from "../../utils/cx";

export type FieldHintProps = ComponentProps<"p"> & { tone?: "default" | "danger" };

export function FieldHint({ tone = "default", className, ...props }: FieldHintProps) {
	return (
		<p
			className={cx("min-h-4 text-xs text-pretty", tone === "danger" ? "text-danger" : "text-fg-muted", className)}
			{...props}
		/>
	);
}
