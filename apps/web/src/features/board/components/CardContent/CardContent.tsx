import { Paperclip } from "@phosphor-icons/react";
import type { TicketSummary } from "@trellis/api";
import {
	LineChanges,
	type LineChangesValue,
	lineChangesVisible,
	PriorityIcon,
	ReviewStatusSummary,
	StatusIcon,
} from "@trellis/ui";
import { gap, ticketTrail } from "../../../../lib/ticketTrail";
import { ActorAvatar } from "../../../agents/ActorAvatar";

export type CardContentProps = {
	ticket: TicketSummary;
	// On the all-tickets board a column holds several statuses, so the card
	// names its own.
	showStatus?: boolean;
	lineChanges?: LineChangesValue | null;
	lineChangesPending?: boolean;
};

// The three rows of a board card: the trail of identifiers with the
// priority, the title, and the meta row. The card on the board and the drag
// preview both draw it, so the preview looks like the card under the
// pointer.
export function CardContent({ ticket, showStatus = false, lineChanges, lineChangesPending = false }: CardContentProps) {
	const progress = ticket.childCount === 0 ? 0 : ticket.childDoneCount / ticket.childCount;
	const trail = ticketTrail(ticket.ancestors, ticket.identifier);
	const showLineChanges = lineChangesVisible(lineChanges);
	const lastActor = ticket.lastActor?.kind === "system" ? null : ticket.lastActor;
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
				{ticket.status.reviewer === "human" && ticket.pr !== null && (
					<ReviewStatusSummary reviews={ticket.pr.reviews} />
				)}
				{(showLineChanges || lastActor !== null) && (
					<span className="ml-auto flex shrink-0 items-center gap-1.5">
						{showLineChanges && <LineChanges value={lineChanges} pending={lineChangesPending} />}
						{lastActor !== null && <ActorAvatar actor={lastActor} ticketId={ticket.id} />}
					</span>
				)}
			</div>
		</>
	);
}
