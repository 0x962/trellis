import type { Comment, Ticket, TimelineItem } from "@trellis/api";
import { Button, SectionHeader } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { useStatuses } from "../hooks/useStatuses";
import { timelineOptions, useTimeline } from "../hooks/useTimeline";
import { ActivityLine } from "./components/ActivityLine";
import { CommentThread } from "./components/CommentThread";
import { Composer } from "./components/Composer";
import { MentionedThread } from "./components/MentionedThread";
import { prependTimeline, updateTimeline } from "./utils/timelineCache";

export type TimelineProps = {
	// Uploads files the composer picks to the ticket.
	onAttachFiles?: (files: File[]) => void;
	ticket: Ticket;
	thread?: string;
};

// The server writes a `comment.created` activity row for each comment. The
// comment section shows that event, so the row draws no line.
const shownInStream = (item: TimelineItem) => item.kind === "comment" || item.action !== "comment.created";

// A collapsed activity section keeps this many recent rows.
const collapsedActivityRows = 3;

// Activity reads oldest first, so the collapsed section keeps the tail: the
// newest rows. The tab that holds this section is named Activity, so no
// heading here repeats that word. The line down the left joins the avatars,
// and it stops at the first and the last one.
function ActivitySection({
	activities,
	reviewer,
}: {
	activities: Extract<TimelineItem, { kind: "activity" }>[];
	reviewer: (name: string) => "human" | "agent";
}) {
	const [open, setOpen] = useState(false);
	const foldable = activities.length > collapsedActivityRows;
	const shown = foldable && !open ? activities.slice(-collapsedActivityRows) : activities;
	return (
		<section aria-label="Activity" className="flex flex-col gap-1">
			{foldable && (
				<div className="flex h-7 items-center">
					<Button size="sm" variant="quiet" aria-expanded={open} onClick={() => setOpen(!open)}>
						{open ? "Show less" : `Show all activity (${activities.length})`}
					</Button>
				</div>
			)}
			<ul
				aria-label="Activity"
				className="relative flex flex-col before:absolute before:top-4 before:bottom-4 before:left-2 before:w-px before:bg-border"
			>
				{shown.map((item) => (
					<ActivityLine key={item.id} item={item} reviewer={reviewer} />
				))}
			</ul>
		</section>
	);
}

// Each section shows its items oldest first. The API pages newest first.
export function Timeline({ ticket, onAttachFiles, thread }: TimelineProps) {
	const { orpc, queryClient } = useApp();
	const key = timelineOptions(orpc, ticket.identifier).queryKey;
	const timeline = useTimeline(ticket.identifier);
	const statuses = useStatuses(ticket.project.path);
	const items = (timeline.data?.pages ?? [])
		.flatMap((page) => page.items)
		.reverse()
		.filter(shownInStream);
	const activities = items.filter((item) => item.kind === "activity");
	const threads = new Map<string, Comment[]>();
	for (const item of items) {
		if (item.kind !== "comment") continue;
		const rootId = item.parentId ?? item.id;
		// `thread` names the comment the reader followed from an inbox link.
		// `MentionedThread` draws that whole thread above, so this section
		// skips it and the reader reads the comment one time.
		if (rootId === thread) continue;
		const group = threads.get(rootId);
		if (group === undefined) threads.set(rootId, [item]);
		else group.push(item);
	}
	const reviewer = (name: string) =>
		statuses.find((status) => status.name === name)?.reviewer === "agent" ? ("agent" as const) : ("human" as const);

	const onEdited = (comment: Comment) =>
		updateTimeline(queryClient, key, (rows) =>
			rows.map((row) => (row.kind === "comment" && row.id === comment.id ? { ...row, ...comment } : row)),
		);
	const onDeleted = (id: string) =>
		updateTimeline(queryClient, key, (rows) => rows.filter((row) => !(row.kind === "comment" && row.id === id)));

	return (
		<section aria-label="Timeline" className="flex flex-col gap-6">
			{thread && <MentionedThread key={thread} id={thread} ticket={ticket} />}
			<ActivitySection activities={activities} reviewer={reviewer} />
			<section aria-label="Comments" className="flex flex-col gap-1">
				<SectionHeader title="Comments" count={threads.size} />
				{threads.size === 0 ? (
					<p className="py-1 text-sm text-fg-muted">No comments yet.</p>
				) : (
					<ul aria-label="Comments" className="flex flex-col gap-5">
						{[...threads].map(([id, comments]) => (
							<CommentThread
								key={id}
								id={id}
								identifier={ticket.identifier}
								comments={comments}
								onEdited={onEdited}
								onDeleted={onDeleted}
								onCreated={(comment) => prependTimeline(queryClient, key, { kind: "comment", ...comment })}
							/>
						))}
					</ul>
				)}
			</section>
			<Composer ticket={ticket} onAttachFiles={onAttachFiles} />
		</section>
	);
}
