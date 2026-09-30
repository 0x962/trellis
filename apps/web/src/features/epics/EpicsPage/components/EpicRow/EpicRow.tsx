import { PencilSimple, Trash } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { EpicSummary } from "@trellis/api";
import { cx, insetRowHover, Menu, StackedBar } from "@trellis/ui";
import { compactRelativeTime } from "../../../../../lib/format";
import { epicSplat } from "../../../../../lib/projectUrl";
import { desktopRowHeight } from "../../../../table/rowHeights";
import { epicProgressLabel, epicSegments } from "../../../epicBar";
import { currentWaveLabel } from "../../../epicNext";

export type EpicRowProps = {
	epic: EpicSummary;
	// True under an archived project: the server refuses every write, so
	// the menu offers none.
	readOnly: boolean;
	onEdit: () => void;
	onDelete: () => void;
};

// Epic rows share the ticket row height, text size, and hover style.
// The menu slot keeps its width while the trigger is hidden.
// The name link fills the row height to make the whole cell a hit area.
export function EpicRow({ epic, readOnly, onEdit, onDelete }: EpicRowProps) {
	const wave = currentWaveLabel(epic);
	// The `relative` class contains the absolute background from `insetRowHover` in this row.
	return (
		<li
			data-epic={epic.slug}
			style={{ height: `${desktopRowHeight}px` }}
			className={cx(
				"group/row relative grid w-full grid-cols-[minmax(0,1fr)_140px_48px_48px_28px] items-center gap-3 text-base border-b border-border px-5 transition-colors duration-hover max-md:grid-cols-[minmax(0,1fr)_48px_48px_28px] max-md:gap-2 max-md:px-4",
				insetRowHover,
			)}
		>
			<Link
				to="/p/$"
				params={{ _splat: epicSplat(epic.ref) }}
				search={{}}
				className="flex h-full min-w-0 items-center gap-2 text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
			>
				<span className="truncate">{epic.name}</span>
				{wave !== null && <span className="truncate text-sm text-fg-muted tabular">{wave}</span>}
			</Link>
			<StackedBar
				label={`${epic.name}: ${epicProgressLabel(epic.counts)} done`}
				segments={epicSegments(epic.counts)}
				legend={false}
				className="w-full max-md:hidden"
			/>
			<span className="text-sm text-fg-muted tabular">{epicProgressLabel(epic.counts)}</span>
			<time dateTime={epic.updatedAt} className="text-sm text-fg-muted tabular">
				{compactRelativeTime(epic.updatedAt)}
			</time>
			<span className="flex w-7 justify-center opacity-0 transition-opacity duration-hover ease-out group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100">
				<Menu
					label={`Actions for ${epic.name}`}
					triggerTooltip="Epic actions"
					items={[
						{ label: "Edit", icon: <PencilSimple />, disabled: readOnly, onSelect: onEdit },
						{ label: "Delete…", icon: <Trash />, danger: true, disabled: readOnly, onSelect: onDelete },
					]}
				/>
			</span>
		</li>
	);
}
