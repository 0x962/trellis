import type { ReactNode } from "react";
import { cx } from "../../utils/cx";

export type SectionHeaderProps = {
	title: string;
	// A count after the title, such as "3" or "3/5". It prints as given.
	count?: ReactNode;
	// Metadata and quiet sm buttons, on the right.
	actions?: ReactNode;
	level?: 2 | 3 | 4;
	appearance?: "default" | "overview" | "prominent";
	description?: string;
	className?: string;
};

// The title size per level. The count draws one step under its title.
const titleSize = { 2: "text-base", 3: "text-sm", 4: "text-sm" } as const;
const countSize = { 2: "text-sm", 3: "text-xs", 4: "text-xs" } as const;

export function SectionHeader({
	title,
	count,
	actions,
	level = 2,
	className,
	appearance = "default",
	description,
}: SectionHeaderProps) {
	const Heading = level === 2 ? "h2" : level === 3 ? "h3" : "h4";
	return (
		<div className={cx(appearance === "default" ? "flex h-7 items-center gap-2" : "flex flex-col gap-1", className)}>
			<div className={appearance === "default" ? "contents" : "flex min-h-5 items-center gap-2"}>
				<Heading className="flex min-w-0 items-baseline gap-2">
					<span
						className={cx(
							"text-fg",
							appearance === "default"
								? cx("truncate font-medium", titleSize[level])
								: appearance === "overview"
									? "text-md font-medium"
									: "text-lg font-semibold",
						)}
					>
						{title}
					</span>
					{count !== undefined && <span className={cx("text-fg-faint tabular", countSize[level])}>({count})</span>}
				</Heading>
				{actions !== undefined && (
					<div
						className={cx(
							"ml-auto flex items-center gap-2",
							appearance === "default" ? "text-sm text-fg-faint" : "text-xs text-fg-muted",
						)}
					>
						{actions}
					</div>
				)}
			</div>
			{description !== undefined && <p className="text-sm text-fg-muted">{description}</p>}
		</div>
	);
}
