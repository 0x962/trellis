import type { ReactNode } from "react";
import { useState } from "react";
import type { TableGroup } from "../../utils/flattenGroups";
import { WaveStartDialog } from "../../WaveStart";

export type WaveStartOptions = {
	groups: readonly TableGroup[];
	// The ids of the tickets that hold an open agent run. The table offers
	// Start wave only once these arrive.
	assignedTicketIds?: ReadonlySet<string>;
};

export type WaveStart = {
	// Opens the dialog on one wave group, or undefined while the table does
	// not know which tickets hold an agent run.
	onStartGroup?: (group: TableGroup) => void;
	dialog: ReactNode;
};

// The Start wave dialog that a wave header opens. The key of the group stays
// set while the dialog closes, so the dialog keeps its lists through the
// close motion.
export function useWaveStart({ groups, assignedTicketIds }: WaveStartOptions): WaveStart {
	const [startKey, setStartKey] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const group = startKey === null ? undefined : groups.find((entry) => entry.key === startKey);
	return {
		onStartGroup:
			assignedTicketIds === undefined
				? undefined
				: (picked) => {
						setStartKey(picked.key);
						setOpen(true);
					},
		dialog:
			group === undefined || assignedTicketIds === undefined ? null : (
				<WaveStartDialog
					open={open}
					onOpenChange={setOpen}
					wave={group.label ?? ""}
					tickets={group.rows}
					assigned={assignedTicketIds}
				/>
			),
	};
}
