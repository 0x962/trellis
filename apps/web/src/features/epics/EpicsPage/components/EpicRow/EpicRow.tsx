import { PencilSimple, Trash } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { EpicSummary } from "@trellis/api";
import { Menu, StackedBar } from "@trellis/ui";
import { compactRelativeTime } from "../../../../../lib/format";
import { epicSplat } from "../../../../../lib/projectPath";
import type { Density } from "../../../../../stores/uiStore";
import { rowHeights } from "../../../../table/rowHeights";
import { epicProgressLabel, epicSegments } from "../../../epicBar";

export type EpicRowProps = {
	epic: EpicSummary;
	density: Density;
	// True under an archived project: the server refuses every write, so
	// the menu offers none.
	readOnly: boolean;
	onEdit: () => void;
	onDelete: () => void;
};

// One epic as a dense row in the ticket table widths: the name, the bar of
// the counts, the progress, the updated time, and the row menu. The name
// link fills the row height, so the hit area is the whole cell. The bar
// has no legend here; the epic page prints the legend. Below 768 px the
// bar leaves so the name keeps room.
export function EpicRow({ epic, density, readOnly, onEdit, onDelete }: EpicRowProps) {
	return (
		<li
			data-epic={epic.slug}
			style={{ height: `${rowHeights[density]}px` }}
			className={
				"group/row grid grid-cols-[minmax(0,1fr)_140px_48px_48px_28px] items-center gap-3 border-b border-border px-5 transition-colors duration-hover hover:bg-band max-md:grid-cols-[minmax(0,1fr)_48px_48px_28px] max-md:gap-2 max-md:px-4"
			}
		>
			<Link
				to="/p/$"
				params={{ _splat: epicSplat(epic.ref) }}
				search={{}}
				className={`flex h-full min-w-0 items-center font-medium text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 ${density === "comfortable" ? "text-base" : "text-sm"}`}
			>
				<span className="truncate">{epic.name}</span>
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
