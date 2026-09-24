import { GroupHeader } from "../../../GroupHeader";
import type { TableGroup } from "../../../utils/flattenGroups";
import { type WaveHeaderOptions, waveHeaderParts } from "../../../WaveHeader";
import type { WaveBox } from "../waveBoxes";

export type GroupHeaderLineProps = {
	group: TableGroup;
	// The offset inside the virtual body.
	top: number;
	// The offset and the height of the box that the group owns, from this
	// header line to the header line of the next group. The header stands at
	// the top of the scroll container while that box passes, and the box ends
	// where the next header starts, so the next header pushes this one out.
	// Undefined on a table that does not hold its headers at the top.
	box?: WaveBox;
	phone: boolean;
	// True while the progress circle of the wave fills to full, because the
	// last open ticket of the wave was marked done a moment ago.
	filling: boolean;
	// The wave controls of a table of one epic.
	waves?: WaveHeaderOptions;
	onToggleGroup: (key: string) => void;
	onCreateInGroup: (group: TableGroup) => void;
	onStartGroup?: (group: TableGroup) => void;
};

// The header line of one group in the virtual body. A status group offers a
// new ticket. A wave group of one epic offers Start wave when it holds a
// row and, when the table has wave controls, the wave actions.
export function GroupHeaderLine({
	group,
	top,
	box,
	phone,
	filling,
	waves,
	onToggleGroup,
	onCreateInGroup,
	onStartGroup,
}: GroupHeaderLineProps) {
	const header = (
		<GroupHeader
			group={group.key}
			label={group.label ?? ""}
			count={group.count}
			countLabel={group.countLabel}
			completedCount={group.completedCount}
			totalCount={group.totalCount}
			forYou={group.forYou}
			done={group.done}
			filling={filling}
			status={group.status}
			category={group.category}
			expanded={group.expanded}
			onToggle={() => onToggleGroup(group.key)}
			onCreate={group.status === undefined ? undefined : () => onCreateInGroup(group)}
			onStart={
				onStartGroup === undefined || group.epicRef === undefined || group.wave === undefined || group.rows.length === 0
					? undefined
					: () => onStartGroup(group)
			}
			{...(waves === undefined ? undefined : waveHeaderParts(group, waves))}
			phone={phone}
			top={box === undefined ? top : undefined}
			sticky={box !== undefined}
		/>
	);
	if (box === undefined) return header;
	// The browser holds the header at the top of the scroll container and
	// stops at the bottom edge of this box, with no work on each scroll
	// event. The box takes no `transform`, because a transformed parent can
	// stop a browser from holding its child at the top.
	return (
		<div
			data-wave-box={group.key}
			style={{ top: `${box.top}px`, height: `${box.height}px` }}
			className="absolute left-0 w-full"
		>
			{header}
		</div>
	);
}
