import { eventApplierFor, type Label, type TicketSummary } from "@trellis/api";
import { Button, toast } from "@trellis/ui";
import { useEffect, useRef } from "react";
import { useApp } from "../../../../lib/appContext";
import { errorMessage } from "../../../../lib/conflict";
import { LabelPicker } from "../../../pickers/LabelPicker";

export type BoardLabelsProps = {
	ticket: TicketSummary;
	onClose: () => void;
};

// The label picker of the card the `l` key names. The board draws no popover
// anchor of its own, so the picker hangs from an invisible button at the top
// of the window, as the status choice does. One pick sends the one label it
// changes and no expected version, because two picks in a row must both land.
export function BoardLabels({ ticket, onClose }: BoardLabelsProps) {
	const { client, queryClient } = useApp();
	// The card element, which takes the focus back when the picker closes.
	// The board draws each card with its ticket id on it.
	const card = useRef<HTMLElement | null>(null);
	useEffect(() => {
		card.current = document.querySelector<HTMLElement>(`[data-ticket-id="${ticket.id}"]`);
	}, [ticket.id]);

	const toggle = async (label: Label, checked: boolean) => {
		const applier = eventApplierFor(queryClient);
		applier.beginMutation(ticket.id);
		try {
			const result = await client.tickets.update({
				ticket: ticket.identifier,
				...(checked ? { addLabels: [label.id] } : { removeLabels: [label.id] }),
			});
			applier.endMutation(ticket.id, result);
		} catch (error) {
			applier.endMutation(ticket.id);
			toast.error(`The labels of ${ticket.identifier} did not change.`, { description: errorMessage(error) });
		}
	};

	return (
		<LabelPicker
			project={ticket.project.path}
			checked={ticket.labels.map((entry) => entry.id)}
			onToggle={(label, checked) => void toggle(label, checked)}
			finalFocus={card}
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			trigger={
				<Button aria-label="Labels" className="fixed top-12 left-1/2 size-px -translate-x-1/2 opacity-0">
					Labels
				</Button>
			}
		/>
	);
}
