import { Checks } from "@phosphor-icons/react";
import type { PageComment, PageCommentThread } from "@trellis/api";
import { Badge, EmptyState, FailureState, IconButton, SectionHeader, Skeleton, Tooltip } from "@trellis/ui";
import { ReviewThreadCard } from "@trellis/ui/review";
import "@trellis/ui/review.css";
import { useEffect, useMemo } from "react";
import { ReadOnlyMarkdown } from "../../../components/ReadOnlyMarkdown";
import { useActor } from "../../../lib/actor";
import { errorMessage } from "../../../lib/conflict";

const authorOf = (comment: PageComment) => comment.actor.displayName ?? comment.actor.name;

const messageOf = (comment: PageComment) => ({
	id: comment.id,
	author: authorOf(comment),
	kind: comment.actor.kind,
	session: null,
	body: comment.body,
	createdAt: comment.createdAt,
	version: 1,
	reactions: [],
});

const cardThreadOf = (thread: PageCommentThread) => {
	const [first, ...replies] = thread.comments;
	return {
		...messageOf(first!),
		threadId: thread.id,
		replies: replies.map(messageOf),
		status: thread.resolved === null ? "open" : "resolved",
		resolvedBy: thread.resolved === null ? null : (thread.resolved.actor.displayName ?? thread.resolved.actor.name),
	};
};

const anchorText = (thread: PageCommentThread) =>
	thread.selectedText === null ? `Element: ${thread.anchor.path}` : `“${thread.selectedText}”`;

export type PageCommentActions = {
	reply: (thread: string, body: string) => Promise<void>;
	resolve: (thread: string, resolved: boolean) => Promise<void>;
	edit: (id: string, body: string) => Promise<void>;
	deleteComment: (id: string) => Promise<void>;
};

export function PageCommentThreads({
	threads,
	selected,
	showResolved,
	readOnly,
	loading,
	loadError,
	actions,
	onSelect,
	onShowResolved,
}: {
	threads: { number: number; thread: PageCommentThread }[];
	selected: string | null;
	showResolved: boolean;
	readOnly: boolean;
	loading: boolean;
	loadError: unknown;
	actions: PageCommentActions;
	onSelect: (id: string) => void;
	onShowResolved: (show: boolean) => void;
}) {
	const actor = useActor();
	const resolvedCount = useMemo(() => threads.filter(({ thread }) => thread.resolved !== null).length, [threads]);
	const visibleThreads = useMemo(
		() => threads.filter(({ thread }) => showResolved || thread.resolved === null),
		[showResolved, threads],
	);
	const comments = useMemo(
		() => new Map(threads.flatMap(({ thread }) => thread.comments.map((comment) => [comment.id, comment]))),
		[threads],
	);
	const ownIds = useMemo(
		() =>
			new Set(
				[...comments.values()]
					.filter((comment) => actor !== null && comment.actor.kind === actor.kind && comment.actor.name === actor.name)
					.map((comment) => comment.id),
			),
		[actor, comments],
	);
	const threadViews = useMemo(
		() =>
			visibleThreads.map(({ number, thread }) => ({
				number,
				thread,
				cardThread: cardThreadOf(thread),
				anchor: anchorText(thread),
			})),
		[visibleThreads],
	);
	useEffect(() => {
		if (selected === null) return;
		document.getElementById(`thread-${selected}`)?.focus({ preventScroll: true });
		document.getElementById(`thread-${selected}`)?.scrollIntoView({ block: "nearest" });
	}, [selected]);
	return (
		<section aria-label="Comments" className="flex flex-col gap-2">
			<SectionHeader
				title="Comments"
				level={3}
				actions={
					resolvedCount > 0 ? (
						<Tooltip content={showResolved ? "Hide resolved threads" : `Show ${resolvedCount} resolved`}>
							<IconButton
								label={showResolved ? "Hide resolved threads" : "Show resolved threads"}
								icon={<Checks />}
								pressed={showResolved}
								onClick={() => onShowResolved(!showResolved)}
							/>
						</Tooltip>
					) : undefined
				}
			/>
			{loadError !== null && (
				<FailureState title="The comments did not load" detail={errorMessage(loadError)} variant="section" />
			)}
			{loading && (
				<div role="status" aria-label="Load comments">
					<Skeleton lines={2} height="h-20" />
				</div>
			)}
			{visibleThreads.length === 0 && !loading && loadError === null && (
				<EmptyState
					image={null}
					title={resolvedCount > 0 ? "Every thread is resolved" : "No comments"}
					description={
						resolvedCount > 0
							? undefined
							: readOnly
								? "Comments are read-only for this Page view."
								: "Select text in the Page, or focus an element and press C, to add a comment."
					}
				/>
			)}
			{threadViews.map(({ number, thread, cardThread, anchor }) => (
				<div
					key={thread.id}
					data-active={thread.id === selected}
					className="rounded-md data-[active=true]:ring-1 data-[active=true]:ring-warning"
				>
					<div className="mb-1 flex items-center gap-2 text-xs text-fg-muted">
						<span className="tabular">Comment {number}</span>
						<Badge>Version {thread.version}</Badge>
					</div>
					<ReviewThreadCard
						thread={cardThread}
						actor={actor?.name}
						anchor={anchor}
						anchorAction={
							<button
								type="button"
								className="block w-full text-left text-xs text-fg-muted"
								onClick={() => onSelect(thread.id)}
							>
								{anchor}
							</button>
						}
						readOnly={readOnly}
						submitRepliesOnEnter
						deleteRootLabel="Delete comment"
						renderBody={(body, message) => {
							const comment = comments.get(message.id)!;
							return (
								<>
									{comment.deletedAt === null ? (
										<ReadOnlyMarkdown markdown={body} className="text-sm" />
									) : (
										<p className="text-sm italic text-fg-faint">Comment deleted</p>
									)}
								</>
							);
						}}
						canChange={(id) => ownIds.has(id) && comments.get(id)?.deletedAt === null}
						onReply={(body) => actions.reply(thread.id, body)}
						onResolve={() => actions.resolve(thread.id, thread.resolved === null)}
						onEdit={(id, body) => actions.edit(id, body)}
						onDelete={(id) => actions.deleteComment(id)}
					/>
				</div>
			))}
		</section>
	);
}
