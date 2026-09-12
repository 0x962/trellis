import type { Comment, Ticket, TimelineItem } from "@trellis/api";
import { SectionHeader } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { useStatuses } from "../hooks/useStatuses";
import { timelineOptions, useTimeline } from "../hooks/useTimeline";
import { ActivityLine } from "./components/ActivityLine";
import { CommentThread } from "./components/CommentThread";
import { Composer } from "./components/Composer";
import { prependTimeline, updateTimeline } from "./utils/timelineCache";

export type TimelineProps = {
	// Uploads files the composer picks to the ticket.
	onAttachFiles?: (files: File[]) => void;
	ticket: Ticket;
};

// The server writes a `comment.created` activity row for each comment. The
// comment card shows that event, so the row draws no line.
const shownInStream = (item: TimelineItem) => item.kind === "comment" || item.action !== "comment.created";

// Each section shows its items oldest first. The API pages newest first.
export function Timeline({ ticket, onAttachFiles }: TimelineProps) {
	const { orpc, queryClient } = useApp();
	const key = timelineOptions(orpc, ticket.identifier).queryKey;
	const timeline = useTimeline(ticket.identifier);
	const statuses = useStatuses(ticket.project.path);
	const items = (timeline.data?.pages ?? [])
		.flatMap((page) => page.items)
		.reverse()
		.filter(shownInStream);
	const comments = items.filter((item) => item.kind === "comment");
	const threads = new Map<string, Comment[]>();
	for (const comment of comments) {
		const rootId = comment.parentId ?? comment.id;
		const group = threads.get(rootId);
		if (group === undefined) threads.set(rootId, [comment]);
		else group.push(comment);
	}
	const seenThreads = new Set<string>();
	const streamItems = items.filter((item) => {
		if (item.kind === "activity") return true;
		const rootId = item.parentId ?? item.id;
		if (seenThreads.has(rootId)) return false;
		seenThreads.add(rootId);
		return true;
	});
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
			<ul aria-label="Timeline">
				<li>
					<SectionHeader title="Activity" />
					<ul
						aria-label="Activity"
						className="relative flex flex-col gap-3 before:absolute before:top-4 before:bottom-4 before:left-2 before:w-px before:bg-border"
					>
						{streamItems.map((item) => {
							if (item.kind === "activity") {
								return <ActivityLine key={item.id} item={item} reviewer={reviewer} />;
							}
							const id = item.parentId ?? item.id;
							return (
								<CommentThread
									key={id}
									id={id}
									identifier={ticket.identifier}
									comments={threads.get(id)!}
									onEdited={onEdited}
									onDeleted={onDeleted}
									onCreated={(comment) => prependTimeline(queryClient, key, { kind: "comment", ...comment })}
								/>
							);
						})}
					</ul>
				</li>
			</ul>
			<Composer ticket={ticket} onAttachFiles={onAttachFiles} />
		</section>
	);
}
