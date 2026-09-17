import { Paperclip } from "@phosphor-icons/react";
import type { TicketSummary } from "@trellis/api";
import { PriorityIcon, StatusIcon } from "@trellis/ui";
import { gap, ticketTrail } from "../../../../lib/ticketTrail";
import { ActorAvatar } from "../../../agents/ActorAvatar";
import { ReviewStatusBadge } from "./components/ReviewStatusBadge";

export type CardContentProps = {
	ticket: TicketSummary;
	// On the all-tickets board a column holds several statuses, so the card
	// names its own.
	showStatus?: boolean;
};

// The three rows of a board card: the trail of identifiers with the
// priority, the title, and the meta row. The card on the board and the drag
// preview both draw it, so the preview looks like the card under the
// pointer.
export function CardContent({ ticket, showStatus = false }: CardContentProps) {
	const progress = ticket.childCount === 0 ? 0 : ticket.childDoneCount / ticket.childCount;
	const trail = ticketTrail(ticket.ancestors, ticket.identifier);
	return (
		<>
			<div className="flex h-4 items-center justify-between gap-1.5">
				<span className="flex min-w-0 items-center gap-1 font-mono text-xs whitespace-nowrap text-fg-faint tabular">
					{trail.map((step, index) => (
						<span key={step} className="flex items-center gap-1">
							{index > 0 && <span aria-hidden="true">→</span>}
							<span className={step === gap ? "" : "shrink-0"}>{step}</span>
						</span>
					))}
				</span>
				{ticket.priority !== "none" && <PriorityIcon priority={ticket.priority} />}
			</div>
			<p className="line-clamp-3 text-base font-medium text-fg">{ticket.title}</p>
			<div className="mt-auto flex min-h-4 min-w-0 items-center gap-1.5 text-xs text-fg-faint tabular">
				{ticket.status.category === "review" && <ReviewStatusBadge reviewState={ticket.pr?.reviewState ?? null} />}
				{ticket.childCount > 0 && (
					<span className="inline-flex items-center gap-1">
						<StatusIcon category="started" progress={progress} label="Sub-ticket progress" />
						{ticket.childDoneCount}/{ticket.childCount}
					</span>
				)}
				{ticket.attachmentCount > 0 && (
					<span className="inline-flex items-center gap-1">
						<Paperclip aria-hidden="true" className="size-3" />
						{ticket.attachmentCount}
					</span>
				)}
				{showStatus && <span className="truncate">{ticket.status.name}</span>}
				{ticket.lastActor !== null && ticket.lastActor.kind !== "system" && (
					<span className="ml-auto shrink-0">
						<ActorAvatar actor={ticket.lastActor} ticketId={ticket.id} />
					</span>
				)}
			</div>
		</>
	);
}
