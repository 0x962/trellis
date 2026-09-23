import type { ReactNode } from "react";
import { cx } from "../../utils/cx";

export type CodeTextProps = {
	children: ReactNode;
	className?: string;
};

// Inline code text. It uses the mono face and inherits the surrounding text
// size, color, line height, and background.
export function CodeText({ children, className }: CodeTextProps) {
	return <span className={cx("font-mono", className)}>{children}</span>;
}
