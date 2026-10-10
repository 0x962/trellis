import type { Epic, TicketSummary } from "@trellis/api";
import { Badge, GroupHeader } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
import { composerActions } from "../../../../composer";
import { useTicketMutations } from "../../../../table/hooks/useTicketMutations";
import type { WaveEditing } from "../../../../table/hooks/useWaveEditing";
import { useWaveStart, type WaveStartAssignmentState } from "../../../../table/TicketTable/useWaveStart";
import type { TableGroup } from "../../../../table/utils/flattenGroups";
import { WaveActions } from "../../../../table/WaveHeader/components/WaveActions";
import { WaveName } from "../../../../table/WaveHeader/components/WaveName";

export function useEpicWhiteboardWaves(
	epic: Epic,
	editing: WaveEditing,
	assignment: WaveStartAssignmentState,
	readOnly: boolean,
) {
	const { orpc, queryClient } = useApp();
	const mutations = useTicketMutations();
	const groups: TableGroup[] = epic.waves.map((wave) => ({
		key: wave.id,
		label: wave.name,
		wave,
		epicRef: epic.ref,
		rows: epic.tickets.filter((ticket) => ticket.wave?.id === wave.id),
		count: wave.counts.total,
		expanded: true,
	}));
	const starts = useWaveStart({ groups, assignment: readOnly ? undefined : assignment });
	const add = async (ticket: TicketSummary, wave: string) => {
		await mutations.updateMany(
			[ticket],
			{ epic: epic.ref, wave },
			{},
			(subject) => `${subject} did not join the wave.`,
		);
		await queryClient.invalidateQueries({ queryKey: orpc.epics.key() });
	};
	return {
		dialog: starts.dialog,
		waves: groups.map((group) => {
			const wave = epic.waves.find((entry) => entry.id === group.key)!;
			const renaming = editing.renamingId === wave.id;
			const newTicket = () => composerActions.open({ project: epic.projectKey, epic: epic.ref, wave: wave.ref });
			return {
				id: wave.id,
				label: wave.name,
				count: `${wave.counts.done}/${wave.counts.total}`,
				current: epic.currentWave?.id === wave.id,
				content: (
					<>
						<GroupHeader
							group={wave.id}
							label={renaming ? "" : wave.name}
							count={renaming ? undefined : `${wave.counts.done}/${wave.counts.total}`}
							collapsible={false}
							labelField={renaming ? <WaveName wave={wave} editing={editing} /> : undefined}
							onCreate={readOnly || renaming ? undefined : newTicket}
							onStart={readOnly || renaming || group.rows.length === 0 ? undefined : () => starts.onStartGroup?.(group)}
							actions={
								readOnly || renaming ? undefined : (
									<WaveActions
										name={wave.name}
										project={epic.projectKey}
										exclude={group.rows.map((ticket) => ticket.identifier)}
										first={!editing.canMove(wave.id, -1)}
										last={!editing.canMove(wave.id, 1)}
										onAddTicket={(ticket) => void add(ticket, wave.ref)}
										onNewTicket={newTicket}
										onRename={() => editing.startRename(wave.id)}
										onMove={(step) => editing.move(wave.id, step)}
										onDelete={() => editing.requestDelete(wave.id)}
									/>
								)
							}
						/>
						{epic.currentWave?.id === wave.id && (
							<div className="px-5">
								<Badge tone="accent" size="sm">
									Current
								</Badge>
							</div>
						)}
						{group.rows.length === 0 && <p className="px-5 py-4 text-sm text-fg-muted">No tickets in this wave</p>}
					</>
				),
			};
		}),
	};
}
