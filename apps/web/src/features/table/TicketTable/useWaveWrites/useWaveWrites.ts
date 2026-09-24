import type { TicketSummary, WaveSummary } from "@trellis/api";
import { useApp } from "../../../../lib/appContext";
import type { useApplyChange } from "../../hooks/useApplyChange";
import type { TicketMutations } from "../../hooks/useTicketMutations";
import type { WaveEditing } from "../../hooks/useWaveEditing";
import type { TableGroup } from "../../utils/flattenGroups";
import type { WaveHeaderOptions } from "../../WaveHeader";

export type WaveWritesOptions = {
	// The wave writes of the epic route. A table that holds no epic and a
	// table with no project get no wave controls.
	waveEditing?: WaveEditing;
	project?: string;
	// The ref of the epic that the selected tickets share, for a new wave.
	epicRef?: string;
	// The tickets of the selection, read at the moment of the write.
	selectedTickets: () => TicketSummary[];
	ticketById: (id: string) => TicketSummary;
	applyChange: ReturnType<typeof useApplyChange>;
	mutations: TicketMutations;
	// Opens the composer inside the epic and the wave of the group.
	onNewTicket: (group: TableGroup) => void;
};

export type WaveWrites = {
	// The wave controls the table body draws, or undefined on a table
	// without them.
	waves?: WaveHeaderOptions & { onDrop: (ticketIds: string[], group: TableGroup) => void };
	createWave: (name: string) => Promise<void>;
};

// The writes that move a ticket between the waves of one epic: the drop of
// dragged rows on a wave header, Add tickets to this wave, and New wave from
// the bulk bar. Each write refetches the epic, because the wave counts of the
// headers live on it.
export function useWaveWrites({
	waveEditing,
	project,
	epicRef,
	selectedTickets,
	ticketById,
	applyChange,
	mutations,
	onNewTicket,
}: WaveWritesOptions): WaveWrites {
	const { client, orpc, queryClient } = useApp();

	const setWave = async (targets: readonly TicketSummary[], wave: WaveSummary | null) => {
		await applyChange(targets, { wave }, targets.length > 1 ? "selection" : "row");
		await queryClient.invalidateQueries({ queryKey: orpc.epics.key() });
	};

	const createWave = async (name: string) => {
		const wave = await client.waves.create({ epic: epicRef!, name });
		await setWave(selectedTickets(), wave);
	};

	if (waveEditing === undefined || project === undefined) return { createWave };
	return {
		createWave,
		waves: {
			editing: waveEditing,
			project,
			onNewTicket,
			// A ticket from outside the epic joins the epic and the wave in one write.
			onAddTicket: async (ticket: TicketSummary, group: TableGroup) => {
				await mutations.updateMany(
					[ticket],
					{ epic: group.epicRef, wave: group.wave!.ref },
					{},
					(subject) => `${subject} did not join ${group.label}.`,
				);
				await queryClient.invalidateQueries({ queryKey: orpc.epics.key() });
			},
			onDrop: (ticketIds: string[], group: TableGroup) =>
				void setWave(ticketIds.map(ticketById), waveEditing.waves.find((wave) => wave.id === group.wave?.id) ?? null),
		},
	};
}
