import type { ReactElement, ReactNode } from "react";
import { cx } from "../../utils/cx";

export type EmptyStateProps = {
	// A lucide icon element, shown at 24 px above the title.
	icon?: ReactElement;
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
// the action, if one exists.
export function EmptyState({ icon, title, description, action, variant = "section", className }: EmptyStateProps) {
	const page = variant === "page";
	return (
		<div
			className={cx(
				"flex flex-col items-center gap-1.5 px-5 text-center text-fg-muted",
				page ? "flex-1 justify-center pb-[15vh]" : "py-10",
				className,
			)}
		>
			{icon && (
				<span aria-hidden="true" className="mb-1 inline-flex size-6 text-fg-faint *:size-full">
					{icon}
				</span>
			)}
			<h3 className={cx("text-md text-fg", page ? "font-semibold" : "font-medium")}>{title}</h3>
			{description && <p className={cx("text-sm text-fg-muted", page ? "max-w-sm" : "max-w-xs")}>{description}</p>}
			{action && <div className={cx(page ? "mt-3" : "mt-2")}>{action}</div>}
		</div>
	);
}
