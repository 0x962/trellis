import { Link } from "@tanstack/react-router";
import type { TicketSummary } from "@trellis/api";
import { Avatar, PriorityIcon, StatusIcon, TicketId } from "@trellis/ui";
import { compactRelativeTime } from "../../../../lib/format";

export type InboxRowProps = {
	ticket: TicketSummary;
};

// One ticket in a Needs you section: priority, id, title, status, who
// touched it last, and when. The row opens the ticket. `system` is the
// server itself and never shows as an actor.
export function InboxRow({ ticket }: InboxRowProps) {
	const { status, lastActor } = ticket;
	return (
		<Link
			to="/t/$identifier"
			params={{ identifier: ticket.identifier }}
			className="flex h-10 items-center gap-3 border-b border-border px-5 text-fg transition-colors duration-hover hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
		>
			<PriorityIcon priority={ticket.priority} />
			<TicketId id={ticket.identifier} className="w-16" />
			<span className="min-w-0 flex-1 truncate">{ticket.title}</span>
			{ticket.parent !== null && (
				<span className="shrink-0 font-mono text-xs text-fg-faint">↳ {ticket.parent.identifier}</span>
			)}
			<span className="flex w-36 shrink-0 items-center gap-1.5 text-sm text-fg-muted">
				<StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} />
				<span className="truncate">{status.name}</span>
			</span>
			<span className="flex w-10 shrink-0 justify-center">
				{lastActor !== null && lastActor.kind !== "system" && <Avatar kind={lastActor.kind} name={lastActor.name} />}
			</span>
			<span className="w-10 shrink-0 text-right text-sm text-fg-faint tabular">
				{compactRelativeTime(ticket.updatedAt)}
			</span>
		</Link>
	);
}
