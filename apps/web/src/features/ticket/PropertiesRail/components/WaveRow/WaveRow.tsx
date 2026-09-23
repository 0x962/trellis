import type { EpicLink, Ticket, WaveLink, WaveSummary } from "@trellis/api";
import { Button, PropertyRow } from "@trellis/ui";
import { useArchivedProjects } from "../../../../../hooks/useArchivedProjects";
import { failToast } from "../../../../../lib/failToast";
import { WavePicker } from "../../../../pickers/WavePicker";
import { useTicketWrite } from "../../../hooks/useTicketWrite";
import { usePickerStore } from "../../../stores/pickerStore";

export type WaveRowProps = {
	ticket: Ticket;
	// The epic of the ticket. A wave belongs to one epic, so a ticket
	// with no epic has no wave row.
	epic: EpicLink;
};

const triggerClass =
	"-ml-2 h-auto min-w-0 max-w-full justify-start whitespace-normal text-left font-normal leading-5 [&_span]:min-w-0 [&_span]:whitespace-normal";

const nameOf = (wave: WaveLink | null) =>
	wave === null ? (
		<span className="text-fg-muted">None</span>
	) : (
		<span className="min-w-0 break-words">{wave.name}</span>
	);

// The wave of the ticket, and the picker that changes it. The picker
// lists the waves of the epic of the ticket and None. A pick paints at
// once and rolls back with a toast on failure. A ticket under an archived
// project takes no write, so the row prints the name with no picker.
export function WaveRow({ ticket, epic }: WaveRowProps) {
	const { write } = useTicketWrite(ticket.identifier);
	const open = usePickerStore((state) => state.open);
	const setOpen = usePickerStore((state) => state.setOpen);
	const readOnly = useArchivedProjects().isArchived(ticket.project.key);

	const pick = async (wave: WaveSummary | null) => {
		setOpen(null);
		const link: WaveLink | null = wave === null ? null : { id: wave.id, ref: wave.ref, name: wave.name };
		try {
			await write(
				(client) => client.tickets.update({ ticket: ticket.identifier, wave: wave === null ? null : wave.ref }),
				{ optimistic: (row) => ({ ...row, wave: link }) },
			);
		} catch (error) {
			failToast(`The wave of ${ticket.identifier} did not change.`, error, () => void pick(wave));
		}
	};

	return (
		<PropertyRow compact align="start" label="Wave">
			{readOnly ? (
				nameOf(ticket.wave)
			) : (
				<WavePicker
					trigger={
						<Button variant="quiet" className={triggerClass}>
							{nameOf(ticket.wave)}
						</Button>
					}
					epic={epic.ref}
					value={ticket.wave?.ref}
					onPick={(wave) => void pick(wave)}
					open={open === "wave"}
					onOpenChange={(next) => setOpen(next ? "wave" : null)}
				/>
			)}
		</PropertyRow>
	);
}
