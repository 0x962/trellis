import type { TicketSummary } from "@trellis/api";
import { Kbd, StatusIcon, useHotkey } from "@trellis/ui";
import { useState } from "react";
import { useInbox } from "../../hooks/useInbox";
import { useInboxActions } from "../../hooks/useInboxActions";
import { useSectionOpen } from "../../hooks/useSectionOpen";
import { focusedIdentifier, focusRowAfter } from "../../utils/rowFocus";
import { InboxSection } from "../InboxSection";
import { SendBackBox } from "../SendBackBox";
import { ReviewActions } from "./components/ReviewActions";

// Tickets in a human-reviewer status, oldest waiting first. `a` approves a
// row into the lowest-position done status; `r` opens the send-back box. The
// approved row collapses out of the section and the next row takes the focus,
// so ten approvals need ten key presses.
export function ReviewSection() {
	const inbox = useInbox();
	const { open, toggle } = useSectionOpen("review", true);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [sendBackId, setSendBackId] = useState<string | null>(null);
	const [announcement, setAnnouncement] = useState("");
	const { move, sweepOut, rowsWithLeaving, isSweeping } = useInboxActions();
	const section = inbox.data?.review;
	const items = section === undefined ? [] : section.items;

	const focusedTicket = () => items.find((row) => row.identifier === focusedIdentifier()) ?? null;

	const approve = (ticket: TicketSummary) => {
		focusRowAfter(ticket.identifier);
		setAnnouncement(`${ticket.identifier} approved`);
		move(ticket, "done", items.indexOf(ticket));
	};

	const closeBox = (ticket: TicketSummary) => {
		setSendBackId(null);
		document.querySelector<HTMLElement>(`[data-inbox-row="${ticket.identifier}"]`)?.focus();
	};

	useHotkey("a", (event) => {
		const ticket = focusedTicket();
		if (ticket === null) return;
		event.preventDefault();
		approve(ticket);
	});
	// The key that opens the box must not also land in it as text.
	useHotkey("r", (event) => {
		const ticket = focusedTicket();
		if (ticket === null) return;
		event.preventDefault();
		setSendBackId(ticket.identifier);
	});

	if (section === undefined || section.total === 0) return null;

	return (
		<>
			<InboxSection
				name="Review"
				total={section.total}
				icon={<StatusIcon category="review" />}
				hint={
					<>
						<Kbd>a</Kbd> approve <Kbd>r</Kbd> send back
					</>
				}
				open={open}
				onToggle={toggle}
				rows={rowsWithLeaving(items)}
				focusedId={focusedId}
				onRowActive={(ticket) => setFocusedId(ticket.identifier)}
				isSweeping={isSweeping}
				renderActions={(ticket) =>
					ticket.identifier === (focusedId ?? items[0]?.identifier) && ticket.identifier !== sendBackId ? (
						<ReviewActions
							ticket={ticket}
							onApprove={() => approve(ticket)}
							onSendBack={() => setSendBackId(ticket.identifier)}
						/>
					) : undefined
				}
				renderPanel={(ticket) =>
					ticket.identifier === sendBackId ? (
						<SendBackBox
							ticket={ticket}
							onClose={() => closeBox(ticket)}
							onSent={() => {
								setSendBackId(null);
								sweepOut(ticket, items.indexOf(ticket));
							}}
						/>
					) : undefined
				}
			/>
			<p role="status" className="sr-only">
				{announcement}
			</p>
		</>
	);
}
