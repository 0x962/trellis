import { GitPullRequest, MinusCircle } from "@phosphor-icons/react";
import type { TicketSummary } from "@trellis/api";
import { CheckRibbon, Menu, PriorityIcon, StatusIcon, TicketId } from "@trellis/ui";
import { compactRelativeTime } from "../../../../../lib/format";
import { ActorAvatar } from "../../../../agents/ActorAvatar";

export type EpicTicketRowProps = {
	ticket: TicketSummary;
	// True under an archived project: the server refuses every write, so
	// the menu offers none.
	readOnly: boolean;
	onOpen: () => void;
	onRemove: () => void;
};

// The check segments the PR badge stands for: the counts, in bucket order.
// The summary holds no check names, so each segment reads "1 check".
const badgeChecks = (pr: NonNullable<TicketSummary["pr"]>) => [
	...Array.from({ length: pr.fail }, () => ({ name: "1 check", bucket: "fail" as const })),
	...Array.from({ length: pr.pending }, () => ({ name: "1 check", bucket: "pending" as const })),
	...Array.from({ length: pr.pass }, () => ({ name: "1 check", bucket: "pass" as const })),
];

// The words for the folded check state of the PR.
const ciLabels = { none: "none", pending: "pending", pass: "passed", fail: "failed" } as const;

const prLabel = (pr: NonNullable<TicketSummary["pr"]>) =>
	`${pr.state.charAt(0).toUpperCase()}${pr.state.slice(1)} PR, checks ${ciLabels[pr.ciState]}`;

// One ticket of an epic, in the row shape of the sub-tickets of a ticket:
// the status icon, the identifier, the title, the priority, the PR badge,
// the last actor, and the updated time. The row menu takes the ticket out
// of the epic. The menu sits beside the open button, because a button
// cannot hold another button.
export function EpicTicketRow({ ticket, readOnly, onOpen, onRemove }: EpicTicketRowProps) {
	const { status, lastActor, pr } = ticket;
	return (
		<li className="group/row flex h-9 w-full items-center border-b border-border pr-2 text-base text-fg transition-colors duration-hover ease-out hover:bg-band">
			<button
				type="button"
				onClick={onOpen}
				className="flex h-full min-w-0 flex-1 items-center gap-3 px-3 text-left focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
			>
				<StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} />
				<TicketId id={ticket.identifier} className="w-16" />
				<span className="min-w-0 flex-1 truncate">{ticket.title}</span>
				<PriorityIcon priority={ticket.priority} />
				<span className="flex w-16 shrink-0 items-center gap-1">
					{pr !== null && (
						<span role="img" aria-label={prLabel(pr)} className="inline-flex items-center gap-1 text-fg-muted">
							<GitPullRequest className="size-3.5" aria-hidden="true" />
							<CheckRibbon size="mini" checks={badgeChecks(pr)} />
						</span>
					)}
				</span>
				<span className="flex w-5 shrink-0 justify-center">
					{lastActor !== null && <ActorAvatar actor={lastActor} ticketId={ticket.id} />}
				</span>
				<time dateTime={ticket.updatedAt} className="w-8 shrink-0 text-right text-sm text-fg-muted tabular">
					{compactRelativeTime(ticket.updatedAt)}
				</time>
			</button>
			<span className="flex w-7 shrink-0 justify-center opacity-0 transition-opacity duration-hover ease-out group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100">
				<Menu
					label={`Actions for ${ticket.identifier}`}
					triggerTooltip="Ticket actions"
					items={[{ label: "Remove from epic", icon: <MinusCircle />, disabled: readOnly, onSelect: onRemove }]}
				/>
			</span>
		</li>
	);
}
