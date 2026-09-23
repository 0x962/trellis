import type { TicketSummary } from "@trellis/api";
import type { GroupHeaderProps } from "@trellis/ui";
import type { KeyboardEvent } from "react";
import type { WaveEditing } from "../hooks/useWaveEditing";
import type { TableGroup } from "../utils/flattenGroups";
import { WaveActions } from "./components/WaveActions";
import { WaveName } from "./components/WaveName";

export type WaveHeaderOptions = {
	editing: WaveEditing;
	// The project whose tickets Add tickets to this wave searches.
	project: string;
	onAddTicket: (ticket: TicketSummary, group: TableGroup) => void;
	onNewTicket: (group: TableGroup) => void;
};

export type WaveHeaderParts = Pick<GroupHeaderProps, "labelField" | "actions" | "onKeyDown">;

// The parts that a wave header of the epic table adds to `GroupHeader`: the
// name field while the person renames the wave, the wave actions, and the
// keys of a focused header. F2 renames, Alt+Shift+Up and Alt+Shift+Down
// move the wave. The No wave group and a wave of another epic get none.
export const waveHeaderParts = (group: TableGroup, options: WaveHeaderOptions): WaveHeaderParts | undefined => {
	const { editing } = options;
	const index = editing.waves.findIndex((wave) => wave.id === group.wave?.id);
	if (index === -1) return undefined;
	const wave = editing.waves[index]!;
	const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === "F2") {
			event.preventDefault();
			editing.startRename(wave.id);
		}
		if (event.altKey && event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
			event.preventDefault();
			editing.move(wave.id, event.key === "ArrowUp" ? -1 : 1);
		}
	};
	return {
		labelField: editing.renamingId === wave.id ? <WaveName wave={wave} editing={editing} /> : undefined,
		actions: (
			<WaveActions
				name={wave.name}
				project={options.project}
				exclude={group.rows.map((row) => row.identifier)}
				first={index === 0}
				last={index === editing.waves.length - 1}
				onAddTicket={(ticket) => options.onAddTicket(ticket, group)}
				onNewTicket={() => options.onNewTicket(group)}
				onRename={() => editing.startRename(wave.id)}
				onMove={(step) => editing.move(wave.id, step)}
				onDelete={() => editing.requestDelete(wave.id)}
			/>
		),
		onKeyDown,
	};
};
