import { Plus, RowsPlusBottom } from "@phosphor-icons/react";
import type { TicketSummary } from "@trellis/api";
import { Tooltip } from "@trellis/ui";
import { TicketPicker } from "../../../../pickers/TicketPicker";
import { TopbarActionButton } from "../../../../shell/Topbar";
import type { WaveEditing } from "../../../../table/hooks/useWaveEditing";

export type EpicCreateActionsProps = {
	// The project whose tickets Add tickets searches.
	project: string;
	// The identifiers of the tickets of the epic, which the picker leaves out.
	exclude: readonly string[];
	waveEditing: WaveEditing;
	onAddTicket: (ticket: TicketSummary) => void;
};

// New wave and Add tickets. The top bar of the epic page and the empty
// state of its Overview draw these same two buttons.
export function EpicCreateActions({ project, exclude, waveEditing, onAddTicket }: EpicCreateActionsProps) {
	return (
		<>
			<Tooltip content="New wave">
				<TopbarActionButton
					data-bar-slot="new-wave"
					label="New wave"
					icon={<RowsPlusBottom />}
					disabled={waveEditing.busy}
					onClick={waveEditing.create}
				/>
			</Tooltip>
			<TicketPicker
				project={project}
				exclude={exclude}
				allowNone={false}
				label="Add to epic"
				placeholder="Add a ticket: an identifier or a title"
				triggerTooltip="Add tickets"
				onPick={(ticket) => {
					if (ticket !== null) onAddTicket(ticket);
				}}
				trigger={<TopbarActionButton data-bar-slot="add-tickets" label="Add tickets" icon={<Plus />} />}
			/>
		</>
	);
}
