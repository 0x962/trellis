import type { ReactNode } from "react";
import { cx } from "../../utils/cx";
import poster from "./poster.jpg";

export type EmptyStateProps = {
	// A small picture above the title, pinned a little crooked like a print
	// on a wall. It is decoration, so screen readers skip it. The page
	// variant draws poster.jpg when this is not set, so every page-level
	// state shows the same picture.
	image?: string;
	title?: string;
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
// starts at the left edge under a heading.
export function EmptyState({ image, title, description, action, variant = "section", className }: EmptyStateProps) {
	const page = variant === "page";
	const picture = image ?? (page ? poster : undefined);
	return (
		<div
			className={cx(
				"flex flex-col items-start gap-2 text-fg-muted",
				page ? "flex-1 px-5 pt-10 max-md:px-4" : title === undefined ? "py-0" : "py-3",
				className,
			)}
		>
			{picture !== undefined && (
				<img src={picture} alt="" className="mb-4 w-24 -rotate-2 rounded-sm shadow-md grayscale" />
			)}
			{title !== undefined && (
				<h3 className={cx("text-fg", page ? "text-xl font-semibold" : "text-sm font-medium")}>{title}</h3>
			)}
			{description && <p className="max-w-xl text-sm text-fg-muted">{description}</p>}
			{action && <div className={cx(page ? "mt-3" : "mt-2")}>{action}</div>}
		</div>
	);
}
