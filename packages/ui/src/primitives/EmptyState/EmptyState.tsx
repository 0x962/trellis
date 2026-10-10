import type { AriaRole, ReactNode } from "react";
import { cx } from "../../utils/cx";
import { AnimalPoster } from "./components/AnimalPoster";

export type EmptyStateProps = {
	// The page variant selects a random animal on each mount when image is
	// undefined. An explicit image keeps its source; null hides the picture.
	image?: string | null;
	title?: ReactNode;
	description?: ReactNode;
	// A Button, shown under the description. A page-level action is md.
	action?: ReactNode;
	// `section` sits inside a list. `page` fills the pane and holds the
	// block near 35% of its height.
	variant?: "section" | "page";
	className?: string;
	role?: AriaRole;
};

// What a list or a page shows when it has nothing to show: the fact, then
// the action, if one exists. It reads as the opening of a document, so it
// starts at the left edge under a heading.
export function EmptyState({
	image,
	title,
	description,
	action,
	variant = "section",
	className,
	role,
}: EmptyStateProps) {
	const page = variant === "page";
	return (
		<div
			role={role}
			className={cx(
				"flex flex-col items-start gap-2 text-fg-muted",
				page ? "flex-1 px-5 pt-10 max-md:px-4" : title === undefined ? "py-0" : "py-3",
				className,
			)}
		>
			{image === undefined && page && <AnimalPoster />}
			{image != null && <img src={image} alt="" className="mb-4 w-24 -rotate-2 rounded-sm shadow-md grayscale" />}
			{title !== undefined && (
				<h3 className={cx("text-fg", page ? "text-xl font-semibold" : "text-sm font-medium")}>{title}</h3>
			)}
			{description && <p className="max-w-xl text-sm text-fg-muted">{description}</p>}
			{action && <div className={cx(page ? "mt-3" : "mt-2")}>{action}</div>}
		</div>
	);
}
