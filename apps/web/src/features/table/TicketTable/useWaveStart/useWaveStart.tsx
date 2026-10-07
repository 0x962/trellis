import type { ReactNode } from "react";
import { useState } from "react";
import type { TableGroup } from "../../utils/flattenGroups";
import { WaveStartDialog } from "../../WaveStart";

export type WaveStartAssignmentState =
	| { status: "loading" }
	| { status: "error"; detail: string; retry: () => void }
	| { status: "ready"; ticketIds: ReadonlySet<string> };

export type WaveStartOptions = {
	groups: readonly TableGroup[];
	assignment?: WaveStartAssignmentState;
};

export type WaveStart = {
	onStartGroup?: (group: TableGroup) => void;
	dialog: ReactNode;
};

// The Start wave dialog that a wave header opens. The key of the group stays
// set while the dialog closes, so the dialog keeps its lists through the
// close motion.
export function useWaveStart({ groups, assignment }: WaveStartOptions): WaveStart {
	const [startKey, setStartKey] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const group = startKey === null ? undefined : groups.find((entry) => entry.key === startKey);
	return {
		onStartGroup:
			assignment === undefined
				? undefined
				: (picked) => {
						setStartKey(picked.key);
						setOpen(true);
					},
		dialog:
			group === undefined || assignment === undefined ? null : (
				<WaveStartDialog
					key={group.key}
					open={open}
					onOpenChange={setOpen}
					wave={group.label ?? ""}
					tickets={group.rows}
					assignment={assignment}
				/>
			),
	};
}
