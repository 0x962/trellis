import type { ReactNode } from "react";
import { cx } from "../../utils/cx";

export type CodeTextProps = { children: ReactNode; className?: string };

// Inline code text. It changes the font only. The text size, the color, the
// line height and the background come from the text around it.
export function CodeText({ children, className }: CodeTextProps) {
	return <code className={cx("font-mono", className)}>{children}</code>;
}
