import type { TicketSummary } from "@trellis/api";
import { Button, Textarea, toast } from "@trellis/ui";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useApp } from "../../../../lib/appContext";
import { targetStatus } from "../../utils/targetStatus";

export type SendBackBoxProps = {
	ticket: TicketSummary;
	// Closes the box and returns the focus to the row.
	onClose: () => void;
	// Runs after the comment and the move both succeed.
	onSent: () => void;
};

// The comment box a send back opens on the row. It posts the comment first,
// then moves the ticket to the lowest-position started status, so the agent
// that picks the ticket up reads why it came back. A comment the server
// refuses leaves the text in the box and moves nothing.
export function SendBackBox({ ticket, onClose, onSent }: SendBackBoxProps) {
	const { client, orpc, queryClient } = useApp();
	const [body, setBody] = useState("");
	const [sending, setSending] = useState(false);
	const field = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		field.current?.focus();
	}, []);

	const send = async () => {
		if (body.trim() === "" || sending) return;
		setSending(true);
		try {
			await client.comments.create({ ticket: ticket.identifier, body });
		} catch (error) {
			setSending(false);
			toast.error(`Couldn't send ${ticket.identifier} back`, { description: (error as Error).message });
			return;
		}
		const { statuses } = await queryClient.ensureQueryData(
			orpc.statuses.list.queryOptions({ input: { project: ticket.project.id } }),
		);
		await client.tickets.move({ ticket: ticket.identifier, status: targetStatus(statuses, "started").id });
		onSent();
	};

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			onClose();
			return;
		}
		if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void send();
		}
	};

	return (
		<div className="flex flex-col gap-2 border-t border-border bg-surface px-5 py-3">
			<Textarea
				ref={field}
				label="What should change?"
				rows={3}
				value={body}
				spellCheck={false}
				onChange={(event) => setBody(event.target.value)}
				onKeyDown={onKeyDown}
			/>
			<div className="flex items-center gap-2">
				<Button variant="primary" disabled={body.trim() === ""} onClick={() => void send()}>
					Send back
				</Button>
				<Button variant="quiet" onClick={onClose}>
					Cancel
				</Button>
			</div>
		</div>
	);
}
