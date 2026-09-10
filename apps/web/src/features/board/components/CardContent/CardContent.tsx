import type { TicketSummary } from "@trellis/api";
import { Avatar, CheckRibbon, PriorityIcon, StatusIcon, TicketId } from "@trellis/ui";
import { GitPullRequest, Paperclip } from "lucide-react";
import { compactRelativeTime } from "../../../../lib/format";

export type CardContentProps = {
	ticket: TicketSummary;
	// On the all-tickets board a column holds several statuses, so the card
	// names its own.
	showStatus?: boolean;
};

const checksFor = (ticket: TicketSummary) => {
	const pr = ticket.pr;
	if (pr === null) return [];
	return [
		...Array.from({ length: pr.pass }, (_, index) => ({ name: `Pass ${index + 1}`, bucket: "pass" as const })),
		...Array.from({ length: pr.fail }, (_, index) => ({ name: `Fail ${index + 1}`, bucket: "fail" as const })),
		...Array.from({ length: pr.pending }, (_, index) => ({ name: `Pending ${index + 1}`, bucket: "pending" as const })),
	];
};

// The three rows of a board card: the ID with the priority, the title, and
// the meta row. The card on the board and the drag preview both draw it,
// so the preview looks like the card under the pointer.
export function CardContent({ ticket, showStatus = false }: CardContentProps) {
	const progress = ticket.childCount === 0 ? 0 : ticket.childDoneCount / ticket.childCount;
	return (
		<>
			<div className="flex h-4 items-center justify-between">
				<TicketId id={ticket.identifier} size="sm" className="text-fg-faint" />
				{ticket.priority !== "none" && <PriorityIcon priority={ticket.priority} />}
			</div>
			<p className="line-clamp-3 text-base font-medium text-fg">{ticket.title}</p>
			<div className="mt-auto flex h-4 min-w-0 items-center gap-1.5 text-xs text-fg-faint tabular">
				{ticket.pr !== null && (
					<>
						<GitPullRequest aria-label={`${ticket.pr.state} PR`} className="size-3 shrink-0" />
						<CheckRibbon checks={checksFor(ticket)} size="mini" />
					</>
				)}
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
					<span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
						<Avatar kind={ticket.lastActor.kind} name={ticket.lastActor.name} />
						{compactRelativeTime(ticket.lastActor.at)}
					</span>
				)}
			</div>
		</>
	);
}
