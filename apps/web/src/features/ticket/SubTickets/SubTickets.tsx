import { Plus } from "@phosphor-icons/react";
import { isReviewDraft, type Ticket, type TicketSummary } from "@trellis/api";
import {
	Button,
	CheckRibbon,
	EmptyState,
	PrGlyph,
	PriorityIcon,
	SectionHeader,
	StatusIcon,
	TicketId,
	Tooltip,
} from "@trellis/ui";
import { compactRelativeTime } from "../../../lib/format";
import { pageSheetActions } from "../../../stores/pageSheetStore";
import { ActorAvatar } from "../../agents/ActorAvatar";
import { composerActions } from "../../composer";
import { statusIconProps } from "../../statusIconProps";

export type SubTicketsProps = {
	ticket: Ticket;
};

const rowClass = "flex h-9 w-full items-center gap-3 border-b border-border px-3 text-base text-fg";

// The check segments a child's PR badge stands for: the counts, in bucket
// order. The summary holds no check names, so each segment reads "1 check".
const badgeChecks = (pr: NonNullable<TicketSummary["pr"]>) => [
	...Array.from({ length: pr.fail }, () => ({ name: "1 check", bucket: "fail" as const })),
	...Array.from({ length: pr.pending }, () => ({ name: "1 check", bucket: "pending" as const })),
	...Array.from({ length: pr.pass }, () => ({ name: "1 check", bucket: "pass" as const })),
];

// The words for the folded check state of a child's PR.
const ciLabels = { none: "none", pending: "pending", pass: "passed", fail: "failed" } as const;

const prLabel = (pr: NonNullable<TicketSummary["pr"]>) =>
	`${pr.isQueued ? "Queued" : pr.state === "open" && isReviewDraft(pr) ? "Draft" : `${pr.state.charAt(0).toUpperCase()}${pr.state.slice(1)}`} PR, checks ${ciLabels[pr.ciState]}`;

// The children of a ticket: the header with the done count and the Add
// button, a progress bar, and one fixed-height row per child. Add opens the
// create dialog with this ticket as the parent, so a sub-ticket takes a
// status, a priority and a description like any other ticket.
export function SubTickets({ ticket }: SubTicketsProps) {
	const done = ticket.children.filter((child) => child.status.category === "done").length;
	const total = ticket.children.length;
	const fill = total === 0 ? 0 : (done / total) * 100;

	return (
		<section aria-label="Sub-tickets" className="flex flex-col gap-2">
			<SectionHeader
				title="Sub-tickets"
				count={`${done}/${total}`}
				actions={
					<Button
						variant="quiet"
						size="sm"
						icon={<Plus />}
						onClick={() => composerActions.open({ project: ticket.project.path, parent: ticket.identifier })}
					>
						Add
					</Button>
				}
			/>
			{total === 0 ? (
				<EmptyState description="Add a sub-ticket to split this work into smaller tasks." />
			) : (
				<div className="overflow-hidden rounded-md border border-border">
					<div
						role="progressbar"
						aria-label="Sub-tickets done"
						aria-valuemin={0}
						aria-valuemax={total}
						aria-valuenow={done}
						className="h-0.75 bg-border"
					>
						<div data-fill="" style={{ width: `${fill.toFixed(2)}%` }} className="h-full bg-success" />
					</div>
					<ul>
						{ticket.children.map((child) => (
							<li key={child.id}>
								<ChildRow child={child} onOpen={() => pageSheetActions.openTicket(child.identifier)} />
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}

function ChildRow({ child, onOpen }: { child: TicketSummary; onOpen: () => void }) {
	const { status, pr } = child;
	return (
		<button
			type="button"
			onClick={onOpen}
			className={`${rowClass} text-left transition-colors duration-hover ease-out hover:bg-band focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2`}
		>
			<StatusIcon {...statusIconProps(status)} />
			<TicketId id={child.identifier} className="w-16" />
			<span className="min-w-0 flex-1 truncate">{child.title}</span>
			<PriorityIcon priority={child.priority} />
			<span className="flex w-16 shrink-0 items-center gap-1">
				{pr !== null && (
					<Tooltip content={prLabel(pr)}>
						<span role="img" aria-label={prLabel(pr)} className="inline-flex items-center gap-1 text-fg-muted">
							<PrGlyph
								state={pr.state}
								isDraft={pr.isDraft}
								isQueued={pr.isQueued}
								localState={pr.localState}
								size="sm"
								decorative
							/>
							<CheckRibbon size="mini" checks={badgeChecks(pr)} decorative />
						</span>
					</Tooltip>
				)}
			</span>
			<span className="flex w-5 shrink-0 justify-center">
				<ActorAvatar ticketId={child.id} />
			</span>
			<time dateTime={child.updatedAt} className="w-8 shrink-0 text-right text-sm text-fg-muted tabular">
				{compactRelativeTime(child.updatedAt)}
			</time>
		</button>
	);
}
