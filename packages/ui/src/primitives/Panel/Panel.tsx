import type { ComponentProps } from "react";
import { cx } from "../../utils/cx";

export type PanelProps = ComponentProps<"section">;

export function Panel({ className, ...props }: PanelProps) {
	return (
		<section {...props} className={cx("overflow-hidden rounded-xl border border-border bg-usage-panel", className)} />
	);
}
