import type { EpicLink, MilestoneLink, MilestoneSummary, Ticket } from "@trellis/api";
import { Button, PropertyRow } from "@trellis/ui";
import { useArchivedProjects } from "../../../../../hooks/useArchivedProjects";
import { failToast } from "../../../../../lib/failToast";
import { MilestonePicker } from "../../../../pickers/MilestonePicker";
import { useTicketWrite } from "../../../hooks/useTicketWrite";
import { usePickerStore } from "../../../stores/pickerStore";

export type MilestoneRowProps = {
	ticket: Ticket;
	// The epic of the ticket. A milestone belongs to one epic, so a ticket
	// with no epic has no milestone row.
	epic: EpicLink;
};

const triggerClass = "-ml-2 max-w-full justify-start font-normal";

const nameOf = (milestone: MilestoneLink | null) =>
	milestone === null ? <span className="text-fg-muted">None</span> : <span className="truncate">{milestone.name}</span>;

// The milestone of the ticket, and the picker that changes it. The picker
// lists the milestones of the epic of the ticket and None. A pick paints at
// once and rolls back with a toast on failure. A ticket under an archived
// project takes no write, so the row prints the name with no picker.
export function MilestoneRow({ ticket, epic }: MilestoneRowProps) {
	const { write } = useTicketWrite(ticket.identifier);
	const open = usePickerStore((state) => state.open);
	const setOpen = usePickerStore((state) => state.setOpen);
	const readOnly = useArchivedProjects().isArchived(ticket.project.path);

	const pick = async (milestone: MilestoneSummary | null) => {
		setOpen(null);
		const link: MilestoneLink | null =
			milestone === null ? null : { id: milestone.id, ref: milestone.ref, name: milestone.name };
		try {
			await write(
				(client) =>
					client.tickets.update({ ticket: ticket.identifier, milestone: milestone === null ? null : milestone.ref }),
				{ optimistic: (row) => ({ ...row, milestone: link }) },
			);
		} catch (error) {
			failToast(`The wave of ${ticket.identifier} did not change.`, error, () => void pick(milestone));
		}
	};

	return (
		<PropertyRow compact label="Wave">
			{readOnly ? (
				nameOf(ticket.milestone)
			) : (
				<MilestonePicker
					trigger={
						<Button variant="quiet" className={triggerClass}>
							{nameOf(ticket.milestone)}
						</Button>
					}
					epic={epic.ref}
					value={ticket.milestone?.ref}
					onPick={(milestone) => void pick(milestone)}
					open={open === "milestone"}
					onOpenChange={(next) => setOpen(next ? "milestone" : null)}
				/>
			)}
		</PropertyRow>
	);
}
