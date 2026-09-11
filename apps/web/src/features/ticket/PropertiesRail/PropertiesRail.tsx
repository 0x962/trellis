import { type ActorRef, activityActions, type Ticket } from "@trellis/api";
import { ActorChip, Button, IconButton, Tooltip } from "@trellis/ui";
import { Copy, Plus } from "lucide-react";
import { isLiveActor } from "../../../lib/actorLive";
import { copyText } from "../../../lib/clipboard";
import { compactRelativeTime } from "../../../lib/format";
import { TicketAgent } from "../../agents/TicketAgent";
import { useTimeline } from "../hooks/useTimeline";
import { useSaveStatusStore } from "../stores/saveStatusStore";
import { PickerRows } from "./components/PickerRows";
import { Row } from "./components/Row";
import { branchName, titleSlug } from "./utils/branchName";

export type PropertiesRailProps = {
	ticket: Ticket;
	// The page draws a 280 px rail; the peek folds the rows into two columns
	// under the title.
	variant: "page" | "peek";
	// Opens the sub-tickets section with its add field focused.
	onAddSubTicket?: () => void;
};

const visibleActor = <T extends ActorRef>(actor: T | null): (T & { kind: "human" | "agent" }) | null => {
	if (actor === null || actor.kind === "system") return null;
	return actor as T & { kind: "human" | "agent" };
};

const timeClass = "ml-auto text-sm whitespace-nowrap text-fg-faint tabular";

// The share of a ring that is filled, as an SVG stroke.
function ProgressRing({ done, total }: { done: number; total: number }) {
	const circumference = 2 * Math.PI * 5;
	const filled = total === 0 ? 0 : (done / total) * circumference;
	return (
		<svg viewBox="0 0 14 14" aria-hidden="true" className="size-3.5 shrink-0 -rotate-90">
			<circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-border" />
			<circle
				cx="7"
				cy="7"
				r="5"
				fill="none"
				stroke="currentColor"
				strokeWidth="2.5"
				strokeDasharray={`${filled} ${circumference}`}
				className="text-success"
			/>
		</svg>
	);
}

function Divider() {
	return <div data-rail-divider="" aria-hidden="true" className="my-2 h-px bg-border" />;
}

// The properties of a ticket. The page rail has three groups: the four
// picker rows, then Sub-tickets and Branch, then Created and Updated.
// The peek groups Branch and timestamps under Details. Created shows the actor of
// the `ticket.created` activity row. Updated shows the last actor, with the
// live dot while an agent is at work, and the save state of the description.
export function PropertiesRail({ ticket, variant, onAddSubTicket }: PropertiesRailProps) {
	const timeline = useTimeline(ticket.identifier);
	const status = useSaveStatusStore();
	const branch = branchName(ticket.identifier, titleSlug(ticket.title));
	const done = ticket.children.filter((child) => child.status.category === "done").length;
	const created = timeline.data?.pages
		.flatMap((page) => page.items)
		.find((item) => item.kind === "activity" && item.action === activityActions.created);
	const creator = visibleActor(created?.actor ?? null);
	const last = visibleActor(ticket.lastActor);
	const saveState = status.identifier === ticket.identifier ? status.state : "idle";

	const subTickets =
		ticket.childCount === 0 ? (
			<Row label="Sub-tickets">
				<Button variant="quiet" size="sm" icon={<Plus />} className="-ml-2.5" onClick={onAddSubTicket}>
					New sub-ticket
				</Button>
			</Row>
		) : (
			<Row label="Sub-tickets">
				<ProgressRing done={done} total={ticket.childCount} />
				<span className="tabular">
					{done} of {ticket.childCount}
				</span>
				{variant === "page" && (
					<Tooltip content="New sub-ticket">
						<IconButton label="New sub-ticket" size="sm" icon={<Plus />} className="ml-auto" onClick={onAddSubTicket} />
					</Tooltip>
				)}
			</Row>
		);
	const branchRow = (
		<Row label="Branch">
			<code className="truncate font-mono text-xs text-fg-muted">{branch}</code>
			<IconButton
				label="Copy branch name"
				size="sm"
				icon={<Copy />}
				onClick={() => void copyText(branch, "Copied the branch name")}
			/>
		</Row>
	);
	const times = (
		<>
			<Row label="Created">
				{creator !== null && <ActorChip name={creator.name} kind={creator.kind} compact />}
				<span className={timeClass}>{compactRelativeTime(ticket.createdAt)}</span>
			</Row>
			<Row label="Updated">
				{last !== null && <ActorChip name={last.name} kind={last.kind} live={isLiveActor(last)} compact />}
				<span className={timeClass}>{compactRelativeTime(ticket.updatedAt)}</span>
				{saveState !== "idle" && (
					<span className="text-xs whitespace-nowrap text-fg-faint">
						{saveState === "saving" ? "Saving…" : "Saved"}
					</span>
				)}
			</Row>
		</>
	);

	if (variant === "peek") {
		return (
			<dl aria-label="Properties" className="grid grid-cols-2 gap-x-6 gap-y-1 max-sm:grid-cols-1">
				<PickerRows ticket={ticket} />
				<div className="col-span-full">
					<TicketAgent ticket={ticket.identifier} disabled={ticket.completedAt !== null} />
				</div>
				<div className="col-span-full min-w-0 mt-1">
					<dt className="sr-only">Additional properties</dt>
					<dd>
						<details className="group">
							<summary className="w-fit cursor-pointer rounded-sm py-1 text-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent">
								Details
							</summary>
							<dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 max-sm:grid-cols-1">
								{ticket.childCount > 0 && subTickets}
								{branchRow}
								{times}
							</dl>
						</details>
					</dd>
				</div>
			</dl>
		);
	}
	return (
		<aside
			aria-label="Properties"
			className="h-full w-70 shrink-0 overflow-y-auto border-l border-border bg-surface px-4 py-3"
		>
			<dl className="flex flex-col gap-0.5">
				<PickerRows ticket={ticket} />
				<div className="col-span-full">
					<TicketAgent ticket={ticket.identifier} disabled={ticket.completedAt !== null} />
				</div>
			</dl>
			<Divider />
			<dl className="flex flex-col gap-0.5">
				{subTickets}
				{branchRow}
			</dl>
			<Divider />
			<dl className="flex flex-col gap-0.5">{times}</dl>
		</aside>
	);
}
