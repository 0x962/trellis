import { type ActorRef, activityActions, type Ticket } from "@trellis/api";
import { ActorChip, Button, cx, IconButton } from "@trellis/ui";
import { Copy } from "lucide-react";
import { isLiveActor } from "../../../lib/actorLive";
import { copyText } from "../../../lib/clipboard";
import { compactRelativeTime } from "../../../lib/format";
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

// The properties of a ticket: eight rows in a fixed order, then the
// version with the save state. Created shows the actor of the `created`
// activity row; Updated shows the last actor with the live dot while an
// agent is at work.
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

	const rows = (
		<>
			<PickerRows ticket={ticket} />
			<Row label="Sub-tickets">
				<ProgressRing done={done} total={ticket.childCount} />
				<span className="tabular">
					{done} of {ticket.childCount}
				</span>
				<Button variant="quiet" size="sm" className="text-fg-faint" onClick={onAddSubTicket}>
					Add
				</Button>
			</Row>
			<Row label="Branch">
				<code className="truncate font-mono text-xs text-fg-muted">{branch}</code>
				<IconButton
					label="Copy branch name"
					size="sm"
					icon={<Copy />}
					onClick={() => void copyText(branch, "Copied the branch name")}
				/>
			</Row>
			<Row label="Created">
				{creator !== null && <ActorChip name={creator.name} kind={creator.kind} />}
				<span className="text-fg-faint tabular">· {compactRelativeTime(ticket.createdAt)}</span>
			</Row>
			<Row label="Updated">
				{last !== null && <ActorChip name={last.name} kind={last.kind} live={isLiveActor(last)} />}
				<span className="text-fg-faint tabular">· {compactRelativeTime(ticket.updatedAt)}</span>
			</Row>
			<Row label="Version">
				<span className="font-mono text-sm text-fg-faint tabular">{ticket.version}</span>
				{saveState !== "idle" && (
					<span className="text-xs text-fg-faint">{saveState === "saving" ? "Saving…" : "Saved"}</span>
				)}
			</Row>
		</>
	);

	if (variant === "peek") {
		return (
			<dl aria-label="Properties" className="grid grid-cols-2 gap-x-6 gap-y-0.5">
				{rows}
			</dl>
		);
	}
	return (
		<aside aria-label="Properties" className={cx("w-70 shrink-0 border-l border-border px-4 py-3")}>
			<dl className="flex flex-col gap-0.5">{rows}</dl>
		</aside>
	);
}
