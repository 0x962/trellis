import type { StatusCategory, StatusSummary } from "@trellis/api";
import { cx, IconButton, StatusIcon } from "@trellis/ui";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { formatCount } from "../../../lib/format";

export type GroupHeaderProps = {
	// The group key: a status slug, a priority, a project ref, or a PR state.
	group: string;
	label: string;
	count: number;
	// The status icon for a status group.
	status?: StatusSummary;
	category?: StatusCategory;
	expanded: boolean;
	onToggle: () => void;
	// Opens the composer with the group's value. Absent on a group that
	// cannot seed a ticket, such as a PR state.
	onCreate?: () => void;
	// The offset inside the virtual body.
	top?: number;
};

// The fixed height of a group header.
export const groupHeaderHeight = 32;

// The head of one group: the icon, the name, the count, and the plus
// button. The name toggles the rows; a collapsed group offers "Show n".
export function GroupHeader({
	group,
	label,
	count,
	status,
	category,
	expanded,
	onToggle,
	onCreate,
	top,
}: GroupHeaderProps) {
	const Chevron = expanded ? ChevronDown : ChevronRight;
	return (
		// biome-ignore lint/a11y/useSemanticElements lint/a11y/useAriaPropsSupportedByRole: The virtual grid keeps each group header in its measured position and exposes whether its rows are visible.
		<div
			role="rowgroup"
			data-group={group}
			aria-expanded={expanded}
			style={{ height: `${groupHeaderHeight}px`, transform: top === undefined ? undefined : `translateY(${top}px)` }}
			className={cx(
				"flex w-full items-center gap-2 border-y border-border bg-bg px-5 text-base font-medium text-fg",
				top === undefined ? "relative" : "absolute top-0 left-0",
			)}
		>
			<button
				type="button"
				onClick={onToggle}
				className="inline-flex h-7 min-w-7 items-center gap-2 rounded-md px-1 transition-colors duration-hover hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
			>
				<Chevron aria-hidden="true" className="size-3.5 text-fg-faint" />
				{category !== undefined && <StatusIcon category={category} reviewer={status?.reviewer ?? undefined} />}
				{label}
			</button>
			<span data-count="" className="font-normal text-fg-faint tabular">
				{formatCount(count)}
			</span>
			{onCreate && <IconButton size="sm" label={`New ticket in ${label}`} icon={<Plus />} onClick={onCreate} />}
			{!expanded && (
				<button
					type="button"
					onClick={onToggle}
					className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-sm font-normal text-fg-faint transition-colors duration-hover hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
				>
					Show {formatCount(count)}
					<ChevronDown aria-hidden="true" className="size-3" />
				</button>
			)}
		</div>
	);
}
