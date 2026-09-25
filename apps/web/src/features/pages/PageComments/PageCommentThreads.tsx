import { Checks } from "@phosphor-icons/react";
import type { PageComment, PageCommentThread } from "@trellis/api";
import { Badge, IconButton, Tooltip } from "@trellis/ui";
import { ReviewThreadCard } from "@trellis/ui/review";
import "@trellis/ui/review.css";
import { useEffect } from "react";
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
		id: thread.id,
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
	remove: (id: string) => Promise<void>;
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
	const resolvedCount = threads.filter(({ thread }) => thread.resolved !== null).length;
	const rows = threads.filter(({ thread }) => showResolved || thread.resolved === null);
	const comments = new Map(threads.flatMap(({ thread }) => thread.comments.map((comment) => [comment.id, comment])));
	const ownIds = new Set(
		[...comments.values()]
			.filter((comment) => actor !== null && comment.actor.kind === actor.kind && comment.actor.name === actor.name)
			.map((comment) => comment.id),
	);
	useEffect(() => {
		if (selected === null) return;
		document.getElementById(`thread-${selected}`)?.focus({ preventScroll: true });
		document.getElementById(`thread-${selected}`)?.scrollIntoView({ block: "nearest" });
	}, [selected]);
	return (
		<section aria-label="Comments" className="flex flex-col gap-2">
			<header className="flex h-8 items-center justify-between">
				<h2 className="text-sm font-medium text-fg-muted">Comments</h2>
				{resolvedCount > 0 && (
					<Tooltip content={showResolved ? "Hide resolved threads" : `Show ${resolvedCount} resolved`}>
						<IconButton
							label={showResolved ? "Hide resolved threads" : "Show resolved threads"}
							icon={<Checks />}
							pressed={showResolved}
							onClick={() => onShowResolved(!showResolved)}
						/>
					</Tooltip>
				)}
			</header>
			{loadError !== null && (
				<p role="alert" className="text-sm text-danger">
					Could not load the comments. {errorMessage(loadError)}
				</p>
			)}
			{loading && (
				<p role="status" className="text-sm text-fg-faint">
					Load comments
				</p>
			)}
			{rows.length === 0 && !loading && loadError === null && (
				<p className="text-sm text-fg-faint">
					{resolvedCount > 0
						? "Every thread is resolved."
						: readOnly
							? "Comments are read-only for this Page view."
							: "Select text in the Page, or focus an element and press C, to add a comment."}
				</p>
			)}
			{rows.map(({ number, thread }) => (
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
						thread={cardThreadOf(thread)}
						actor={actor?.name}
						anchor={anchorText(thread)}
						readOnly={readOnly}
						submitRepliesOnEnter
						deleteRootLabel="Delete comment"
						renderBody={(body, message) => {
							const comment = comments.get(message.id)!;
							return (
								<>
									{message.root && (
										<button
											type="button"
											className="mb-2 block w-full text-left text-xs text-fg-muted"
											onClick={() => onSelect(thread.id)}
										>
											{anchorText(thread)}
										</button>
									)}
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
						onDelete={(id) => actions.remove(id)}
					/>
				</div>
			))}
		</section>
	);
}
