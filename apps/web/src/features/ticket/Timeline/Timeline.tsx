import type { Comment, Ticket } from "@trellis/api";
import { Button, Segmented } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { timelineOptions, useTimeline } from "../hooks/useTimeline";
import { ActivityLine } from "./components/ActivityLine";
import { CommentCard } from "./components/CommentCard";
import { Composer } from "./components/Composer";
import { RunLine } from "./components/RunLine";
import { collapseRuns } from "./utils/collapseRuns";
import { updateTimeline } from "./utils/timelineCache";

export type TimelineProps = {
	ticket: Ticket;
};

type Filter = "all" | "comments";

const filters = [
	{ value: "all", label: "All" },
	{ value: "comments", label: "Comments" },
] as const;

// Comments and activity as one stream, oldest first, with the composer
// pinned under the newest item. The server pages newest first; an older
// page goes above the rows on screen.
export function Timeline({ ticket }: TimelineProps) {
	const { orpc, queryClient } = useApp();
	const key = timelineOptions(orpc, ticket.identifier).queryKey;
	const timeline = useTimeline(ticket.identifier);
	const [filter, setFilter] = useState<Filter>("all");
	const items = (timeline.data?.pages ?? []).flatMap((page) => page.items).reverse();
	const shown = filter === "comments" ? items.filter((item) => item.kind === "comment") : items;
	const entries = collapseRuns(shown);

	const onEdited = (comment: Comment) =>
		updateTimeline(queryClient, key, (rows) =>
			rows.map((row) => (row.kind === "comment" && row.id === comment.id ? { ...row, ...comment } : row)),
		);
	const onDeleted = (id: string) =>
		updateTimeline(queryClient, key, (rows) => rows.filter((row) => !(row.kind === "comment" && row.id === id)));

	return (
		<section aria-label="Timeline" className="flex flex-col gap-2">
			<header className="flex h-7 items-center gap-2 text-base font-medium text-fg">
				Timeline
				<Segmented
					label="Timeline filter"
					options={filters}
					value={filter}
					onValueChange={setFilter}
					className="ml-auto"
				/>
			</header>
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
						<ActivityLine key={entry.items[0]!.id} item={entry.items[0]!} />
					) : (
						<RunLine key={entry.items[0]!.id} items={entry.items} />
					),
				)}
			</ul>
			<Composer ticket={ticket} />
		</section>
	);
}
