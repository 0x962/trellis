import { PencilSimple, Trash } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { EpicSummary } from "@trellis/api";
import { cx, insetRowHover, Menu, StackedBar } from "@trellis/ui";
import { compactRelativeTime } from "../../../../../lib/format";
import { epicSplat } from "../../../../../lib/projectUrl";
import type { Density } from "../../../../../stores/uiStore";
import { rowHeights } from "../../../../table/rowHeights";
import { epicProgressLabel, epicSegments } from "../../../epicBar";
import { currentWaveLabel } from "../../../epicNext";

export type EpicRowProps = {
	epic: EpicSummary;
	density: Density;
	// True under an archived project: the server refuses every write, so
	// the menu offers none.
	readOnly: boolean;
	onEdit: () => void;
	onDelete: () => void;
};

// One epic as a dense row with the classes of the ticket table `Row`: the
// height from `rowHeights[density]`, the text size of the density on the
// row, the inset hover band, the same padding and gaps, and muted
// `text-sm tabular` numbers. The tracks are the `columnWidths` of the
// ticket table: the bar takes the status track (140px), the progress takes
// the sub-tickets track (48px), the time takes the updated track (48px),
// and the menu slot is the 28 px of an `IconButton` of size sm. The slot
// keeps its width while the trigger is hidden. The name link fills the row
// height, so the hit area is the whole cell. After the name the link prints
// the current wave and its place, "Surfaces · 2 of 4", in the muted
// text of the numbers. Both texts truncate inside the name track. The bar
// has no legend here; the epic page prints the legend. Below 768 px the bar leaves so the name
// keeps room.
export function EpicRow({ epic, density, readOnly, onEdit, onDelete }: EpicRowProps) {
	const wave = currentWaveLabel(epic);
	return (
		<li
			data-epic={epic.slug}
			style={{ height: `${rowHeights[density]}px` }}
			className={cx(
				"group/row grid w-full grid-cols-[minmax(0,1fr)_140px_48px_48px_28px] items-center gap-3 border-b border-border px-5 transition-colors duration-hover max-md:grid-cols-[minmax(0,1fr)_48px_48px_28px] max-md:gap-2 max-md:px-4",
				density === "comfortable" ? "text-base" : "text-sm",
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
