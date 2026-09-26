import { Checks } from "@phosphor-icons/react";
import type { ResourceComment, ResourceCommentThread } from "@trellis/api";
import { IconButton, Tooltip } from "@trellis/ui";
import { ReviewThreadCard } from "@trellis/ui/review";
import "@trellis/ui/review.css";
import { useEffect, useState } from "react";
import { ReadOnlyMarkdown } from "../../../../../../../../../components/ReadOnlyMarkdown";
import { useActor } from "../../../../../../../../../lib/actor";
import { errorMessage } from "../../../../../../../../../lib/conflict";
import type { DocumentComments as Comments } from "../../hooks/useDocumentComments";
import { CommentDraft } from "./components/CommentDraft";
import { QuotedText } from "./components/QuotedText";
import { marginThreads } from "./threadOrder";

const authorOf = (comment: ResourceComment) => comment.actor.displayName ?? comment.actor.name;

// A comment in the shape of a review message, so the thread draws with the
// review thread card of the diff.
const messageOf = (comment: ResourceComment) => ({
	id: comment.id,
	author: authorOf(comment),
	kind: comment.actor.kind,
	session: null,
	body: comment.body,
	createdAt: comment.createdAt,
	version: 1,
	reactions: [],
});

const cardThreadOf = (thread: ResourceCommentThread) => {
	const [first, ...replies] = thread.comments;
	return {
		...messageOf(first!),
		threadId: thread.id,
		replies: replies.map(messageOf),
		status: thread.resolved === null ? "open" : "resolved",
		resolvedBy: thread.resolved === null ? null : (thread.resolved.actor.displayName ?? thread.resolved.actor.name),
	};
};

// The comments margin of a document: the comment being written, then every
// open thread in the order its text reads. The check button shows the
// resolved threads too. A click on a thread marks its text in the document,
// and a click on its quote scrolls the document to that text. A sheet that
// holds the margin names it in its own header, so it passes `titled` false.
export function DocumentComments({ comments, titled }: { comments: Comments; titled: boolean }) {
	const actor = useActor();
	const [showResolved, setShowResolved] = useState(false);
	const tracked = comments.editor?.threads;
	const rows = marginThreads(
		comments.threads,
		(id) => {
			const thread = tracked?.get(id);
			if (thread === undefined) return undefined;
			return thread.range === null ? null : { from: thread.range.from };
		},
		showResolved,
	);
	const active = comments.editor?.active ?? null;
	const resolvedCount = comments.threads.filter((thread) => thread.resolved !== null).length;
	// A person edits and deletes their own comments only.
	const ownIds = new Set(
		comments.threads.flatMap((thread) =>
			thread.comments
				.filter((comment) => comment.actor.kind === "human" && comment.actor.name === actor?.name)
				.map((comment) => comment.id),
		),
	);

	useEffect(() => {
		if (active !== null) document.getElementById(`thread-${active}`)?.scrollIntoView({ block: "nearest" });
	}, [active]);

	return (
		<section aria-label="Comments" className="flex flex-col gap-1">
			<header className="flex h-8 items-center justify-between">
				<h2 className={titled ? "text-sm font-medium text-fg-muted" : "sr-only"}>Comments</h2>
				{resolvedCount > 0 && (
					<Tooltip content={showResolved ? "Hide resolved threads" : `Show ${resolvedCount} resolved`}>
						<IconButton
							label={showResolved ? "Hide resolved threads" : "Show resolved threads"}
							icon={<Checks />}
							pressed={showResolved}
							onClick={() => setShowResolved(!showResolved)}
						/>
					</Tooltip>
				)}
			</header>
			{comments.draftQuote !== null && (
				<CommentDraft quote={comments.draftQuote} onSend={comments.sendDraft} onCancel={comments.cancelDraft} />
			)}
			{comments.loadError !== null && (
				<p role="alert" className="text-sm text-danger">
					Could not load the comments. {errorMessage(comments.loadError)}
				</p>
			)}
			{rows.length === 0 && comments.draftQuote === null && comments.loadError === null && (
				<p className="text-sm text-fg-faint">
					{resolvedCount > 0
						? "Every thread is resolved."
						: "Select text in the document, then press Comment in its menu."}
				</p>
			)}
			{rows.map(({ thread, textRemoved }) => (
				// A click inside a thread marks its text; the controls in it
				// keep their own keyboard access.
				// biome-ignore lint/a11y/noStaticElementInteractions: the thread card holds the focusable controls
				// biome-ignore lint/a11y/useKeyWithClickEvents: the thread card holds the focusable controls
				<div
					key={thread.id}
					data-active={thread.id === active}
					className="rounded-md data-[active=true]:ring-1 data-[active=true]:ring-warning"
					onClick={() => comments.open(thread.id)}
				>
					<ReviewThreadCard
						thread={cardThreadOf(thread)}
						actor={actor?.name}
						anchorAction={
							<button
								type="button"
								className="block w-full text-left"
								disabled={textRemoved}
								onClick={() => comments.reveal(thread.id)}
							>
								<QuotedText quote={thread.anchor.quote} textRemoved={textRemoved} />
							</button>
						}
						renderBody={(body) => <ReadOnlyMarkdown markdown={body} className="text-sm" />}
						canChange={(id) => ownIds.has(id)}
						onReply={(body) => comments.reply(thread.id, body)}
						onResolve={() => comments.resolve(thread.id, thread.resolved === null)}
						onEdit={(id, body) => comments.edit(id, body)}
						onDelete={(id) => comments.remove(id)}
					/>
				</div>
			))}
		</section>
	);
}
