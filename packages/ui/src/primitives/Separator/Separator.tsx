import { Separator as BaseSeparator } from "@base-ui/react/separator";
import { cx } from "../../utils/cx";

export type SeparatorProps = {
	orientation?: "horizontal" | "vertical";
	className?: string;
};

// A 1 px rule. Vertical needs a parent with a height.
export function Separator({ orientation = "horizontal", className }: SeparatorProps) {
	return (
		<BaseSeparator
			orientation={orientation}
			className={cx("shrink-0 bg-border", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)}
		/>
	);
}
