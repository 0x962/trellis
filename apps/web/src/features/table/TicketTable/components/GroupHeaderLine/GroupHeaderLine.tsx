import { GroupHeader as SharedGroupHeader } from "@trellis/ui";
import { formatCount } from "../../../../../lib/format";
import { progressIcon } from "../../../../progressIcon";
import { GroupHeader, phoneGroupHeaderHeight } from "../../../GroupHeader";
import { groupHeaderHeight } from "../../../rowHeights";
import type { TableGroup } from "../../../utils/flattenGroups";
import { type WaveHeaderOptions, waveHeaderParts } from "../../../WaveHeader";
import type { WaveBox } from "../../waveBoxes";

export type GroupHeaderLineProps = {
	group: TableGroup;
	// The offset inside the virtual body.
	top: number;
	// The box that the group owns. Undefined on a table that does not hold
	// its headers at the top.
	box?: WaveBox;
	phone: boolean;
	// True while the progress circle of the wave fills to full, because the
	// last open ticket of the wave was marked done a moment ago.
	filling: boolean;
	// The wave controls of a table of one epic.
	waves?: WaveHeaderOptions;
	// True when this line is a wave section inside the ticket grid.
	waveSection?: boolean;
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
	waveSection = false,
	onToggleGroup,
	onCreateInGroup,
	onStartGroup,
}: GroupHeaderLineProps) {
	const parts = waves === undefined ? undefined : waveHeaderParts(group, waves);
	const onCreate = group.status === undefined ? undefined : () => onCreateInGroup(group);
	const onStart =
		onStartGroup === undefined || group.epicRef === undefined || group.wave === undefined || group.rows.length === 0
			? undefined
			: () => onStartGroup(group);
	const header = waveSection ? (
		<SharedGroupHeader
			group={group.key}
			label={group.label ?? ""}
			count={[
				group.countLabel ?? formatCount(group.count),
				...(group.forYou !== undefined && group.forYou > 0 ? [`${formatCount(group.forYou)} for you`] : []),
			].join(" \u00b7 ")}
			showCount={formatCount(group.count)}
			icon={
				group.completedCount === undefined || group.totalCount === undefined
					? undefined
					: progressIcon(group.completedCount, group.totalCount, group.done === true, filling)
			}
			expanded={group.expanded}
			onToggle={() => onToggleGroup(group.key)}
			onCreate={onCreate}
			onStart={onStart}
			{...parts}
			phone={phone}
			height={phone ? phoneGroupHeaderHeight : groupHeaderHeight}
			sticky={box !== undefined}
			layout="section"
		/>
	) : (
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
			onCreate={onCreate}
			onStart={onStart}
			{...parts}
			phone={phone}
			top={box === undefined ? top : undefined}
			sticky={box !== undefined}
		/>
	);
	if (box === undefined) {
		if (!waveSection) return header;
		return (
			// biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The virtual grid positions this row.
			<div
				role="row"
				style={{
					height: `${phone ? phoneGroupHeaderHeight : groupHeaderHeight}px`,
					transform: `translateY(${top}px)`,
				}}
				className="absolute inset-x-0 top-0"
			>
				{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The collapse button owns keyboard focus. */}
				<div role="gridcell" className="h-full w-full">
					{header}
				</div>
			</div>
		);
	}
	// The browser holds the header at the top of the scroll container and
	// stops at the bottom edge of this box, with no work on each scroll
	// event. The box takes no `transform`, because a transformed parent can
	// stop a browser from holding its child at the top.
	return (
		<div
			role={waveSection ? "row" : undefined}
			data-wave-box={group.key}
			style={{ top: `${box.top}px`, height: `${box.height}px` }}
			className="absolute left-0 w-full"
		>
			{waveSection ? (
				// biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The collapse button owns keyboard focus.
				<div role="gridcell" className="h-full w-full">
					{header}
				</div>
			) : (
				header
			)}
		</div>
	);
}
