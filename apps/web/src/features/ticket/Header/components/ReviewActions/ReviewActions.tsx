import type { Status, Ticket } from "@trellis/api";
import { Button, Dialog, Textarea, useHotkey } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { lowestPositionStatus } from "../../../../../lib/statusPicks";
import { useEnsureStatuses } from "../../../hooks/useStatuses";
import { useTicketWrite } from "../../../hooks/useTicketWrite";
import { failToast } from "../../../utils/failToast";

export type ReviewActionsProps = {
	ticket: Ticket;
};

// Approve and Send back, on a ticket that waits in a human-reviewer
// status. Approve moves it to the lowest done status. Send back asks what
// should change, posts that as a comment, and moves it to the lowest
// started status. Both paint at once and roll back with a toast.
export function ReviewActions({ ticket }: ReviewActionsProps) {
	const { client } = useApp();
	const { write } = useTicketWrite(ticket.identifier);
	const ensureStatuses = useEnsureStatuses(ticket.project.path);
	const [asking, setAsking] = useState(false);
	const [reason, setReason] = useState("");
	const shown = ticket.status.category === "review" && ticket.status.reviewer === "human";

	const moveTo = async (status: Status) => {
		try {
			await write((api) => api.tickets.move({ ticket: ticket.identifier, status: status.slug }), {
				optimistic: (row) => ({ ...row, status: { ...status } }),
			});
		} catch (error) {
			failToast(`${ticket.identifier} did not move to ${status.name}.`, error, () => void moveTo(status));
		}
	};

	const approve = async () => moveTo(lowestPositionStatus(await ensureStatuses(), "done")!);

	const sendBack = async () => {
		const body = reason.trim();
		setAsking(false);
		setReason("");
		if (body !== "") await client.comments.create({ ticket: ticket.identifier, body });
		await moveTo(lowestPositionStatus(await ensureStatuses(), "started")!);
	};

	useHotkey("a", () => {
		if (shown) void approve();
	});
	useHotkey("r", () => {
		if (shown) setAsking(true);
	});

	if (!shown) return null;
	return (
		<>
			<Button kbd="a" onClick={() => void approve()}>
				Approve
			</Button>
			<Button kbd="r" onClick={() => setAsking(true)}>
				Send back
			</Button>
			<Dialog
				open={asking}
				onOpenChange={setAsking}
				title={`Send ${ticket.identifier} back`}
				description="trellis saves the comment on the ticket and moves the ticket to the first started status."
			>
				<Textarea
					label="Reason to send back"
					rows={4}
					autoFocus
					value={reason}
					onChange={(event) => setReason(event.target.value)}
				/>
				<div className="flex justify-end gap-2">
					<Button variant="quiet" onClick={() => setAsking(false)}>
						Cancel
					</Button>
					<Button variant="primary" onClick={() => void sendBack()}>
						Send back
					</Button>
				</div>
			</Dialog>
		</>
	);
}
