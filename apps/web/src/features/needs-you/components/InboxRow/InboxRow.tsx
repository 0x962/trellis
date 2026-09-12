import { Chat, GitPullRequest } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { TicketSummary } from "@trellis/api";
import { Avatar, type Check, CheckRibbon, cx, PriorityIcon, StatusIcon, TicketId } from "@trellis/ui";
import { compactRelativeTime } from "../../../../lib/format";

export type InboxRowProps = {
	ticket: TicketSummary;
	// False hides the status column, for a section whose rows share a status.
	showStatus?: boolean;
};

// A summary carries the number of checks in each bucket and not their names,
// so the ribbon on a row stands for those counts alone.
const badgeChecks = (pr: NonNullable<TicketSummary["pr"]>): Check[] => [
	...Array.from({ length: pr.fail }, () => ({ name: "check", bucket: "fail" as const })),
	...Array.from({ length: pr.pending }, () => ({ name: "check", bucket: "pending" as const })),
	...Array.from({ length: pr.pass }, () => ({ name: "check", bucket: "pass" as const })),
];

// One ticket in a Needs you section. The whole row is the link to the
// ticket page, where the person acts on the ticket. Every row is 36 px tall,
// and 44 px on a coarse pointer, whether or not the ticket has a parent, a
// pull request, or sub-tickets, so a row that gains one of them pushes
// nothing. Under 768 px the status, the pull request, and the last actor are
// hidden, so the title keeps room to read.
export function InboxRow({ ticket, showStatus = true }: InboxRowProps) {
	const { status, lastActor, parent, pr } = ticket;
	return (
		<Link
			to="/t/$identifier"
			params={{ identifier: ticket.identifier }}
			data-inbox-row={ticket.identifier}
			className={cx(
				"flex h-9 w-full items-center gap-3 border-b border-border px-5 text-fg max-md:gap-2 max-md:px-4 pointer-coarse:h-11",
				"transition-colors duration-hover ease-out hover:bg-band",
				"focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
			)}
		>
			<PriorityIcon priority={ticket.priority} />
			<TicketId id={ticket.identifier} className="w-16 text-fg-faint" />
			<span className="flex min-w-0 flex-1 items-center gap-2">
				<span className="truncate text-base">{ticket.title}</span>
				{parent !== null && <span className="shrink-0 font-mono text-xs text-fg-muted">↳ {parent.identifier}</span>}
				{ticket.childCount > 0 && (
					<span
						data-sub-tickets=""
						title="Sub-tickets done"
						className="flex shrink-0 items-center gap-1 text-xs text-fg-muted tabular"
					>
						<StatusIcon category="started" progress={ticket.childDoneCount / ticket.childCount} className="size-3" />
						{ticket.childDoneCount}/{ticket.childCount}
					</span>
				)}
				{ticket.commentCount > 0 && (
					<span
						data-comment-count=""
						title="Comments"
						className="flex shrink-0 items-center gap-1 text-xs text-fg-muted tabular"
					>
						<Chat className="size-3" aria-hidden="true" />
						{ticket.commentCount}
					</span>
				)}
			</span>
			{showStatus && (
				<span className="flex w-36 shrink-0 items-center gap-1.5 text-sm text-fg-faint max-md:hidden">
					<StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} />
					<span className="truncate">{status.name}</span>
				</span>
			)}
			<span className="flex w-16 shrink-0 items-center gap-1.5 max-md:hidden">
				{pr !== null && (
					<span data-pr-state={pr.state} className="flex items-center gap-1.5 text-fg-faint">
						<GitPullRequest className="size-3.5" aria-hidden="true" />
						<CheckRibbon size="mini" checks={badgeChecks(pr)} />
					</span>
				)}
			</span>
			<span className="flex w-10 shrink-0 justify-center max-md:hidden">
				{lastActor !== null && lastActor.kind !== "system" && <Avatar kind={lastActor.kind} name={lastActor.name} />}
			</span>
			<span className="w-10 shrink-0 text-right text-sm text-fg-muted tabular">
				{compactRelativeTime(ticket.updatedAt)}
			</span>
		</Link>
	);
}
