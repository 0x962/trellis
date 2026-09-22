import { GroupHeader } from "../../../GroupHeader";
import type { TableGroup } from "../../../utils/flattenGroups";
import { type WaveHeaderOptions, waveHeaderParts } from "../../../WaveHeader";

export type GroupHeaderLineProps = {
	group: TableGroup;
	// The offset inside the virtual body.
	top: number;
	phone: boolean;
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
	phone,
	waves,
	onToggleGroup,
	onCreateInGroup,
	onStartGroup,
}: GroupHeaderLineProps) {
	return (
		<GroupHeader
			group={group.key}
			label={group.label ?? ""}
			count={group.count}
			countLabel={group.countLabel}
			completedCount={group.completedCount}
			totalCount={group.totalCount}
			forYou={group.forYou}
			done={group.done}
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
			top={top}
		/>
	);
}
