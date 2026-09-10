import { Link } from "@tanstack/react-router";
import type { TicketSummary } from "@trellis/api";
import { Avatar, type Check, CheckRibbon, cx, PriorityIcon, StatusIcon, TicketId } from "@trellis/ui";
import { GitPullRequest, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import { compactRelativeTime } from "../../../../lib/format";

export type InboxRowProps = {
	ticket: TicketSummary;
	// The buttons the row shows on hover. They stay in the tab order, so no
	// action is hover-only.
	actions?: ReactNode;
	// Marks after the title, such as the names of the failing checks.
	meta?: ReactNode;
	// The panel under the row, such as the send-back comment box.
	panel?: ReactNode;
	// 0 on the one row the section's roving tabindex points at, -1 on the rest.
	tabIndex?: number;
	// True while the row collapses out of its section. A leaving row is out of
	// the section's data already: it holds its place until the collapse ends
	// and offers no action.
	sweeping?: boolean;
};

// A summary carries the number of checks in each bucket and not their names,
// so the ribbon on a row stands for those counts alone.
const badgeChecks = (pr: NonNullable<TicketSummary["pr"]>): Check[] => [
	...Array.from({ length: pr.fail }, () => ({ name: "check", bucket: "fail" as const })),
	...Array.from({ length: pr.pending }, () => ({ name: "check", bucket: "pending" as const })),
	...Array.from({ length: pr.pass }, () => ({ name: "check", bucket: "pass" as const })),
];

// One ticket in a Needs you section. Every row is 40 px tall, whether or not
// the ticket has a parent, a pull request, or sub-tickets, so a row that
// gains one of them pushes nothing.
export function InboxRow({ ticket, actions, meta, panel, tabIndex = -1, sweeping = false }: InboxRowProps) {
	const { status, lastActor, parent, pr } = ticket;
	return (
		<tr
			data-inbox-row={ticket.identifier}
			data-sweeping={sweeping ? "" : undefined}
			tabIndex={tabIndex}
			className={cx(
				"group relative flex w-full border-b border-border text-fg transition-all ease-out",
				"hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
				sweeping && "h-0 overflow-hidden border-transparent opacity-0 duration-sweep",
				!sweeping && (panel === undefined ? "h-10 duration-hover" : "h-auto duration-hover"),
			)}
		>
			<td className="flex min-w-0 flex-1 flex-col p-0">
				{/* Under 768 px the status, the pull request, and the last actor
				are hidden, so the title keeps room to read. */}
				<span className="flex h-10 shrink-0 items-center gap-3 px-5 max-md:gap-2 max-md:px-4">
					<PriorityIcon priority={ticket.priority} />
					<TicketId id={ticket.identifier} className="w-16" />
					<span className="flex min-w-0 flex-1 items-center gap-2">
						<Link
							to="/t/$identifier"
							params={{ identifier: ticket.identifier }}
							tabIndex={-1}
							className="truncate hover:underline"
						>
							{ticket.title}
						</Link>
						{parent !== null && <span className="shrink-0 font-mono text-xs text-fg-faint">↳ {parent.identifier}</span>}
						{ticket.childCount > 0 && (
							<span
								data-sub-tickets=""
								title="Sub-tickets done"
								className="flex shrink-0 items-center gap-1 text-xs text-fg-faint tabular"
							>
								<StatusIcon
									category="started"
									progress={ticket.childDoneCount / ticket.childCount}
									className="size-3"
								/>
								{ticket.childDoneCount}/{ticket.childCount}
							</span>
						)}
						{ticket.commentCount > 0 && (
							<span
								data-comment-count=""
								title="Comments"
								className="flex shrink-0 items-center gap-1 text-xs text-fg-faint tabular"
							>
								<MessageSquare className="size-2.75" aria-hidden="true" />
								{ticket.commentCount}
							</span>
						)}
						{meta}
					</span>
					<span className="flex w-36 shrink-0 items-center gap-1.5 text-sm text-fg-muted max-md:hidden">
						<StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} />
						<span className="truncate">{status.name}</span>
					</span>
					<span className="flex w-16 shrink-0 items-center gap-1.5 max-md:hidden">
						{pr !== null && (
							<span data-pr-state={pr.state} className="flex items-center gap-1.5 text-fg-faint">
								<GitPullRequest className="size-3.5" aria-hidden="true" />
								<CheckRibbon size="mini" checks={badgeChecks(pr)} />
							</span>
						)}
					</span>
					<span className="flex w-10 shrink-0 justify-center max-md:hidden">
						{lastActor !== null && lastActor.kind !== "system" && (
							<Avatar kind={lastActor.kind} name={lastActor.name} />
						)}
					</span>
					<span className="w-10 shrink-0 text-right text-sm text-fg-faint tabular">
						{compactRelativeTime(ticket.updatedAt)}
					</span>
					{actions !== undefined && (
						<span className="absolute right-5 flex items-center gap-1.5 bg-surface pl-6 opacity-0 transition-opacity duration-hover group-hover:opacity-100 group-focus-within:opacity-100">
							{actions}
						</span>
					)}
				</span>
				{panel}
			</td>
		</tr>
	);
}
