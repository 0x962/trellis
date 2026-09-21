import { useQuery } from "@tanstack/react-query";
import type { TimelineItem } from "@trellis/api";
import { EmptyState, SectionHeader } from "@trellis/ui";
import { useEffect } from "react";
import { useApp } from "../../../lib/appContext";
import { compactRelativeTime } from "../../../lib/format";

export type CommentsBlockProps = {
	ticket: string;
	count: number;
};

const commentsOf = (items: readonly TimelineItem[]) => items.filter((item) => item.kind === "comment");

const actorName = (comment: Extract<TimelineItem, { kind: "comment" }>) =>
	comment.actor.displayName ?? comment.actor.name;

export function CommentsBlock({ ticket, count }: CommentsBlockProps) {
	const { orpc } = useApp();
	const timeline = useQuery(orpc.timeline.list.queryOptions({ input: { ticket, limit: 100 } }));
	const comments = commentsOf(timeline.data?.items ?? []);

	useEffect(() => {
		if (window.location.hash !== "#comments") return;
		document.getElementById("comments")?.scrollIntoView({ block: "start" });
	}, []);

	return (
		<section id="comments" aria-label="Comments" className="flex min-w-0 scroll-mt-6 flex-col">
			<SectionHeader title="Comments" count={String(count)} textCase="caps" />
			{timeline.isPending ? (
				<p role="status" className="py-3 text-sm text-fg-muted">
					Load comments...
				</p>
			) : timeline.isError ? (
				<p role="alert" className="py-3 text-sm text-danger">
					{timeline.error.message}
				</p>
			) : comments.length === 0 ? (
				<EmptyState variant="section" title="No comments found" />
			) : (
				<div className="flex flex-col divide-y divide-border">
					{comments.map((comment) => (
						<article key={comment.id} className="flex min-w-0 flex-col gap-1 py-3">
							<div className="flex min-w-0 items-center gap-2 text-xs text-fg-faint">
								<span className="truncate font-medium text-fg-muted">{actorName(comment)}</span>
								<span aria-hidden="true">/</span>
								<time dateTime={comment.createdAt} className="shrink-0 tabular">
									{compactRelativeTime(comment.createdAt)}
								</time>
							</div>
							<p className="whitespace-pre-wrap text-sm text-fg">{comment.body}</p>
						</article>
					))}
				</div>
			)}
		</section>
	);
}
