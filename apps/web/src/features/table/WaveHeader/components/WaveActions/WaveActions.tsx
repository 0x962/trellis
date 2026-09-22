import { DotsThree, ListPlus } from "@phosphor-icons/react";
import type { TicketSummary } from "@trellis/api";
import { IconButton, Menu } from "@trellis/ui";
import { TicketPicker } from "../../../../pickers/TicketPicker";

export type WaveActionsProps = {
	name: string;
	// The project whose tickets the picker searches.
	project: string;
	// The identifiers of the tickets of the wave, which the picker leaves out.
	exclude: readonly string[];
	first: boolean;
	last: boolean;
	onAddTicket: (ticket: TicketSummary) => void;
	onNewTicket: () => void;
	onRename: () => void;
	onMove: (step: -1 | 1) => void;
	onDelete: () => void;
};

// The actions of a wave header: Add tickets to this wave, and the Wave
// actions menu. The keys beside the menu items work on a focused header.
export function WaveActions({
	name,
	project,
	exclude,
	first,
	last,
	onAddTicket,
	onNewTicket,
	onRename,
	onMove,
	onDelete,
}: WaveActionsProps) {
	return (
		<>
			<TicketPicker
				project={project}
				exclude={exclude}
				allowNone={false}
				label={`Add to ${name}`}
				placeholder="Add a ticket: an identifier or a title"
				triggerTooltip="Add tickets to this wave"
				onPick={(ticket) => {
					if (ticket !== null) onAddTicket(ticket);
				}}
				trigger={<IconButton size="xs" label={`Add tickets to ${name}`} icon={<ListPlus />} />}
			/>
			<Menu
				label={`Actions for ${name}`}
				triggerTooltip="Wave actions"
				trigger={<IconButton size="xs" label={`Actions for ${name}`} icon={<DotsThree />} />}
				items={[
					{
						type: "group",
						items: [
							{ label: "New ticket in this wave", onSelect: onNewTicket },
							{ label: "Rename", kbd: "F2", onSelect: onRename },
						],
					},
					{
						type: "group",
						items: [
							{ label: "Move up", kbd: "⌥⇧↑", disabled: first, onSelect: () => onMove(-1) },
							{ label: "Move down", kbd: "⌥⇧↓", disabled: last, onSelect: () => onMove(1) },
						],
					},
					{ type: "group", items: [{ label: "Delete wave", danger: true, onSelect: onDelete }] },
				]}
			/>
		</>
	);
}
