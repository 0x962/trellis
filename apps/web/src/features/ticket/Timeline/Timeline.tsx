import type { Comment, Ticket, TimelineItem } from "@trellis/api";
import { Button, cx, SectionHeader } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { useStatuses } from "../hooks/useStatuses";
import { timelineOptions, useTimeline } from "../hooks/useTimeline";
import { ActivityLine } from "./components/ActivityLine";
import { CommentCard } from "./components/CommentCard";
import { Composer } from "./components/Composer";
import { RunLine } from "./components/RunLine";
import { collapseRuns } from "./utils/collapseRuns";
import { updateTimeline } from "./utils/timelineCache";

export type TimelineProps = {
	// The peek pins the composer to the bottom of its scroll area.
	pinned?: boolean;
	// Uploads files the composer picks to the ticket.
	onAttachFiles?: (files: File[]) => void;
	ticket: Ticket;
};

type Filter = "all" | "comments";

const filters = [
	{ value: "all", label: "All" },
	{ value: "comments", label: "Comments" },
] as const;

// The server writes a `comment.created` activity row for each comment. The
// comment card shows that event, so the row draws no line.
const shownInStream = (item: TimelineItem) => item.kind === "comment" || item.action !== "comment.created";

// Comments and activity as one stream, oldest first, with the composer
// pinned under the newest item. The server pages newest first; an older
// page goes above the rows on screen.
export function Timeline({ ticket, pinned = false, onAttachFiles }: TimelineProps) {
	const { orpc, queryClient } = useApp();
	const key = timelineOptions(orpc, ticket.identifier).queryKey;
	const timeline = useTimeline(ticket.identifier);
	const statuses = useStatuses(ticket.project.path);
	const [filter, setFilter] = useState<Filter>("all");
	const items = (timeline.data?.pages ?? [])
		.flatMap((page) => page.items)
		.reverse()
		.filter(shownInStream);
	const shown = filter === "comments" ? items.filter((item) => item.kind === "comment") : items;
	const entries = collapseRuns(shown);
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
			<SectionHeader
				title="Timeline"
				actions={
					<fieldset aria-label="Timeline filter" className="flex items-center gap-3">
						{filters.map((option) => (
							<button
								key={option.value}
								type="button"
								aria-pressed={filter === option.value}
								onClick={() => setFilter(option.value)}
								className={cx(
									"h-7 rounded-sm text-sm transition-colors duration-hover ease-out focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
									filter === option.value ? "font-medium text-fg" : "text-fg-faint hover:text-fg-muted",
								)}
							>
								{option.label}
							</button>
						))}
					</fieldset>
				}
			/>
			{timeline.hasNextPage && (
				<Button variant="quiet" size="sm" className="self-start" onClick={() => void timeline.fetchNextPage()}>
					Load older
				</Button>
			)}
			<ul aria-label="Timeline" className="flex flex-col">
				{entries.map((entry) =>
					entry.kind === "comment" ? (
						<CommentCard
							key={entry.item.id}
							comment={entry.item as Comment}
							formatClassName="comment-markdown"
							onEdited={onEdited}
							onDeleted={onDeleted}
						/>
					) : entry.items.length === 1 ? (
						<ActivityLine key={entry.items[0]!.id} item={entry.items[0]!} reviewer={reviewer} />
					) : (
						<RunLine key={entry.items[0]!.id} items={entry.items} reviewer={reviewer} />
					),
				)}
			</ul>
			<Composer ticket={ticket} pinned={pinned} onAttachFiles={onAttachFiles} />
		</section>
	);
}
