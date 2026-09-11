import type { Comment, Ticket, TimelineItem } from "@trellis/api";
import { Button, SectionHeader } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { useStatuses } from "../hooks/useStatuses";
import { timelineOptions, useTimeline } from "../hooks/useTimeline";
import { ActivityLine } from "./components/ActivityLine";
import { CommentThread } from "./components/CommentThread";
import { Composer } from "./components/Composer";
import { RunLine } from "./components/RunLine";
import { collapseRuns } from "./utils/collapseRuns";
import { prependTimeline, updateTimeline } from "./utils/timelineCache";

export type TimelineProps = {
	// The peek pins the composer to the bottom of its scroll area.
	pinned?: boolean;
	// Uploads files the composer picks to the ticket.
	onAttachFiles?: (files: File[]) => void;
	ticket: Ticket;
};

// The server writes a `comment.created` activity row for each comment. The
// comment card shows that event, so the row draws no line.
const shownInStream = (item: TimelineItem) => item.kind === "comment" || item.action !== "comment.created";

// Each section shows its items oldest first. The API pages newest first.
export function Timeline({ ticket, pinned = false, onAttachFiles }: TimelineProps) {
	const { orpc, queryClient } = useApp();
	const key = timelineOptions(orpc, ticket.identifier).queryKey;
	const timeline = useTimeline(ticket.identifier);
	const statuses = useStatuses(ticket.project.path);
	const [expandedActivity, setExpandedActivity] = useState(false);
	const items = (timeline.data?.pages ?? [])
		.flatMap((page) => page.items)
		.reverse()
		.filter(shownInStream);
	const activity = collapseRuns(items).filter((entry) => entry.kind === "activity");
	const shownActivity = expandedActivity ? activity : activity.slice(-3);
	const comments = items.filter((item) => item.kind === "comment");
	const threads = new Map<string, Comment[]>();
	for (const comment of comments) {
		const rootId = comment.parentId ?? comment.id;
		const group = threads.get(rootId);
		if (group === undefined) threads.set(rootId, [comment]);
		else group.push(comment);
	}
	const threadEntries = [...threads];
	const reviewer = (name: string) =>
		statuses.find((status) => status.name === name)?.reviewer === "agent" ? ("agent" as const) : ("human" as const);

	const onEdited = (comment: Comment) =>
		updateTimeline(queryClient, key, (rows) =>
			rows.map((row) => (row.kind === "comment" && row.id === comment.id ? { ...row, ...comment } : row)),
		);
	const onDeleted = (id: string) =>
		updateTimeline(queryClient, key, (rows) => rows.filter((row) => !(row.kind === "comment" && row.id === id)));

	return (
		<section aria-label="Timeline" className="flex flex-col gap-2">
			{timeline.hasNextPage && (
				<Button variant="quiet" size="sm" className="self-start" onClick={() => void timeline.fetchNextPage()}>
					Load older
				</Button>
			)}
			<ul aria-label="Timeline" className="flex flex-col gap-6">
				<li>
					<SectionHeader
						title="Activity"
						actions={
							activity.length > 3 && (
								<Button
									variant="quiet"
									size="sm"
									onClick={() => setExpandedActivity(!expandedActivity)}
									aria-expanded={expandedActivity}
								>
									{expandedActivity ? "Show less activity" : "Show all activity"}
								</Button>
							)
						}
					/>
					<ul aria-label="Activity" className="flex flex-col">
						{shownActivity.map((entry) =>
							entry.items.length === 1 ? (
								<ActivityLine key={entry.items[0]!.id} item={entry.items[0]!} reviewer={reviewer} />
							) : (
								<RunLine key={entry.items[0]!.id} items={entry.items} reviewer={reviewer} />
							),
						)}
					</ul>
				</li>
				<li>
					<SectionHeader title="Comments" count={comments.length} />
					<ul aria-label="Comments" className="flex flex-col">
						{threadEntries.map(([id, rows], index) => (
							<CommentThread
								key={id}
								id={id}
								identifier={ticket.identifier}
								comments={rows}
								showActor={
									index === 0 ||
									rows[0]!.parentId !== null ||
									threadEntries[index - 1]![1][0]!.parentId !== null ||
									threadEntries[index - 1]![1][0]!.resolvedAt !== null ||
									threadEntries[index - 1]![1].at(-1)!.actor.name !== rows[0]!.actor.name ||
									threadEntries[index - 1]![1].at(-1)!.actor.kind !== rows[0]!.actor.kind
								}
								onEdited={onEdited}
								onDeleted={onDeleted}
								onCreated={(comment) => prependTimeline(queryClient, key, { kind: "comment", ...comment })}
							/>
						))}
					</ul>
				</li>
			</ul>
			<Composer ticket={ticket} pinned={pinned} onAttachFiles={onAttachFiles} />
		</section>
	);
}
