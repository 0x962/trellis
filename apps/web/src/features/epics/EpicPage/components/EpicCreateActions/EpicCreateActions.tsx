import { Plus, RowsPlusBottom, Ticket } from "@phosphor-icons/react";
import type { TicketSummary } from "@trellis/api";
import { Menu } from "@trellis/ui";
import { useRef, useState } from "react";
import { TicketPicker } from "../../../../pickers/TicketPicker";
import { TopbarActionButton } from "../../../../shell/Topbar";
import type { WaveEditing } from "../../../../table/hooks/useWaveEditing";

export type EpicCreateActionsProps = {
	epic: string;
	// The ticket search stays inside this project.
	project: string;
	// Tickets in the epic cannot appear in the search results.
	exclude: readonly string[];
	waveEditing: WaveEditing;
	onAddTicket: (ticket: TicketSummary) => void;
};

// The top bar and the empty state share the same Add menu.
export function EpicCreateActions({ epic, project, exclude, waveEditing, onAddTicket }: EpicCreateActionsProps) {
	const [ticketsOpen, setTicketsOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	return (
		<div className="relative inline-flex">
			<Menu
				label="Add"
				triggerTooltip="Add"
				trigger={<TopbarActionButton ref={trigger} data-bar-slot="add" label="Add" icon={<Plus />} />}
				items={[
					{ label: "Ticket", icon: <Ticket />, onSelect: () => setTicketsOpen(true) },
					{ label: "Wave", icon: <RowsPlusBottom />, disabled: waveEditing.busy, onSelect: waveEditing.create },
				]}
			/>
			{ticketsOpen && (
				<TicketPicker
					scope={epic}
					project={project}
					exclude={exclude}
					allowNone={false}
					label="Add to epic"
					placeholder="Add a ticket: an identifier or a title"
					open={ticketsOpen}
					onOpenChange={setTicketsOpen}
					finalFocus={trigger}
					onPick={(ticket) => {
						if (ticket !== null) onAddTicket(ticket);
					}}
					trigger={
						<button type="button" tabIndex={-1} aria-label="Add to epic" className="absolute top-1/2 left-1/2" />
					}
				/>
			)}
		</div>
	);
}
