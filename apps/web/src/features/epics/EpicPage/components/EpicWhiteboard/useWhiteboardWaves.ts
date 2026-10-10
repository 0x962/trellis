import { useMutation } from "@tanstack/react-query";
import type { Epic } from "@trellis/api";
import type { EpicWhiteboardProps } from "@trellis/ui/epic-whiteboard";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { nextWaveName } from "../../../../pickers/utils/nextWaveName";

type Selection = Parameters<EpicWhiteboardProps["onCreateWave"]>[0];

export function useWhiteboardWaves(epic: Epic, readOnly: boolean) {
	const { client, orpc, queryClient } = useApp();
	const [selection, setSelection] = useState<Selection | null>(null);
	const [placements, setPlacements] = useState<EpicWhiteboardProps["wavePlacements"]>([]);
	const create = useMutation({
		mutationFn: ({ name, selected }: { name: string; selected: Selection }) =>
			client.waves.createWithTickets({ epic: epic.id, name, tickets: selected.ticketIds }),
		onSuccess: async (wave, { selected }) => {
			setPlacements((pending) => [...pending, { waveId: wave.id, ...selected }]);
			setSelection(null);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.epics.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.tickets.key() }),
			]);
		},
	});
	return {
		placements,
		placed: (ids: string[]) => setPlacements((pending) => pending.filter((entry) => !ids.includes(entry.waveId))),
		select: (selected: Selection) => {
			if (readOnly || create.isPending) return;
			create.reset();
			setSelection(selected);
		},
		draft:
			selection === null
				? null
				: {
						name: nextWaveName(epic.waves),
						ticketCount: selection.ticketIds.length,
						busy: create.isPending,
						error: create.error?.message,
						onCreate: (name: string) => create.mutate({ name, selected: selection }),
						onClose: () => setSelection(null),
					},
	};
}
