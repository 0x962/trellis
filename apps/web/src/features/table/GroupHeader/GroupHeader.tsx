import { CaretDown, CaretRight, Plus } from "@phosphor-icons/react";
import type { StatusCategory, StatusSummary } from "@trellis/api";
import { cx, IconButton, StatusIcon } from "@trellis/ui";
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
	// Below 768 px. The header then takes the taller box, because its
	// controls draw 44 px there.
	phone?: boolean;
	// The offset inside the virtual body.
	top?: number;
};

// The fixed height of a group header.
export const groupHeaderHeight = 32;

// The box below 768 px. The toggle, the "Show n" button, and the plus draw
// 44 px on a coarse pointer, so the header holds them with 2 px to spare.
export const phoneGroupHeaderHeight = 48;

// The plus shows on header hover and on keyboard focus inside the header.
// A touch screen has no hover, so there it always shows.
const revealed =
	"opacity-0 transition-opacity duration-hover group-hover/header:opacity-100 group-focus-within/header:opacity-100 [@media(hover:none)]:opacity-100";

// The head of one group on the band: the chevron, the icon, the name, and
// the count on the left; "Show n" and the plus on the right. The name
// toggles the rows.
export function GroupHeader({
	group,
	label,
	count,
	status,
	category,
	expanded,
	onToggle,
	onCreate,
	phone = false,
	top,
}: GroupHeaderProps) {
	const Chevron = expanded ? CaretDown : CaretRight;
	return (
		// biome-ignore lint/a11y/useSemanticElements lint/a11y/useAriaPropsSupportedByRole: The virtual grid keeps each group header in its measured position and exposes whether its rows are visible.
		<div
			role="rowgroup"
			data-group={group}
			aria-expanded={expanded}
			style={{
				height: `${phone ? phoneGroupHeaderHeight : groupHeaderHeight}px`,
				transform: top === undefined ? undefined : `translateY(${top}px)`,
			}}
			className={cx(
				"group/header flex w-full items-center gap-2 border-y border-border bg-band px-5",
				top === undefined ? "relative" : "absolute top-0 left-0",
			)}
		>
			<button
				type="button"
				onClick={onToggle}
				className="-ml-1 inline-flex h-7 min-w-7 items-center gap-2 rounded-md px-1 text-sm font-medium text-fg-muted transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11 pointer-coarse:min-w-11"
			>
				<Chevron aria-hidden="true" className="size-3 text-fg-faint" />
				{category !== undefined && <StatusIcon category={category} reviewer={status?.reviewer ?? undefined} />}
				{label}
			</button>
			<span data-count="" className="text-sm text-fg-faint tabular">
				{formatCount(count)}
			</span>
			<span className="ml-auto flex items-center gap-1">
				{!expanded && (
					<button
						type="button"
						onClick={onToggle}
						className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-sm text-fg-faint transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11 pointer-coarse:min-w-11"
					>
						Show {formatCount(count)}
						<CaretDown aria-hidden="true" className="size-3" />
					</button>
				)}
				{onCreate && (
					<IconButton
						size="xs"
						round
						label={`New ticket in ${label}`}
						icon={<Plus />}
						className={revealed}
						onClick={onCreate}
					/>
				)}
			</span>
		</div>
	);
}
