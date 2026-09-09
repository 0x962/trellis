import type { ReactElement, ReactNode } from "react";
import { cx } from "../../utils/cx";

export type EmptyStateProps = {
	// A lucide icon element, shown at 24 px above the title.
	icon?: ReactElement;
	title: string;
	description?: string;
	// A Button, shown under the description.
	action?: ReactNode;
	className?: string;
};

// What a list shows when it has nothing to show.
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
	return (
		<div className={cx("flex flex-col items-center gap-1.5 px-5 py-10 text-center text-fg-muted", className)}>
			{icon && (
				<span aria-hidden="true" className="mb-1 inline-flex size-6 text-fg-faint *:size-full">
					{icon}
				</span>
			)}
			<h3 className="text-md font-medium text-fg">{title}</h3>
			{description && <p className="max-w-xs text-sm text-fg-muted">{description}</p>}
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}
