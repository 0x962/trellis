import type { ReactNode } from "react";
import { cx } from "../../utils/cx";

export type EmptyStateProps = {
	title: string;
	description?: ReactNode;
	// A Button, shown under the description. A page-level action is md.
	action?: ReactNode;
	// `section` sits inside a list. `page` fills the pane and holds the
	// block near 35% of its height.
	variant?: "section" | "page";
	className?: string;
};

// What a list or a page shows when it has nothing to show: the fact, then
// the action, if one exists. It reads as the opening of a document, so it
// starts at the left edge under a heading and carries no picture.
export function EmptyState({ title, description, action, variant = "section", className }: EmptyStateProps) {
	const page = variant === "page";
	return (
		<div
			className={cx(
				"flex flex-col items-start gap-2 text-fg-muted",
				page ? "flex-1 px-5 pt-10 max-md:px-4" : "px-1 py-8",
				className,
			)}
		>
			<h3 className={cx("text-fg", page ? "text-xl font-semibold" : "text-md font-medium")}>{title}</h3>
			{description && <p className="max-w-xl text-sm text-fg-muted">{description}</p>}
			{action && <div className={cx(page ? "mt-3" : "mt-2")}>{action}</div>}
		</div>
	);
}
