import type { ReactNode } from "react";
import { cx } from "../../utils/cx";

export type SectionHeaderProps = {
	title: string;
	// A count after the title, such as "3" or "3/5". It prints as given.
	count?: ReactNode;
	// Metadata and quiet sm buttons, on the right.
	actions?: ReactNode;
	level?: 2 | 3;
	// `caps` draws the title in capital letters and leaves the text as
	// written, so a reader and a screen reader get the words of the title.
	// The region titles of the ticket page and the review page use it.
	textCase?: "as-written" | "caps";
	className?: string;
};

// The 28 px header row of a section on a ticket, a settings page, or a
// project settings page. An empty section is this row alone, with its
// action on the right.
export function SectionHeader({
	title,
	count,
	actions,
	level = 2,
	textCase = "as-written",
	className,
}: SectionHeaderProps) {
	const Heading = level === 2 ? "h2" : "h3";
	return (
		<div className={cx("flex h-7 items-center gap-2", className)}>
			<Heading className="flex min-w-0 items-baseline gap-2">
				<span className={cx("truncate text-base font-medium text-fg", textCase === "caps" && "uppercase")}>
					{title}
				</span>
				{count !== undefined && <span className="text-sm text-fg-faint tabular">({count})</span>}
			</Heading>
			{actions !== undefined && <div className="ml-auto flex items-center gap-2 text-sm text-fg-faint">{actions}</div>}
		</div>
	);
}
