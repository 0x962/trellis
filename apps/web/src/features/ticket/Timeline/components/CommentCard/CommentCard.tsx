import type { Comment } from "@trellis/api";
import { ActorChip, Button, ConfirmDialog, cx, Menu, type MenuItem, Textarea } from "@trellis/ui";
import { useCallback, useState } from "react";
import { ReadOnlyMarkdown } from "../../../../../components/ReadOnlyMarkdown";
import { useApp } from "../../../../../lib/appContext";
import { copyText } from "../../../../../lib/clipboard";
import { failToast } from "../../../../../lib/failToast";
import { compactRelativeTime } from "../../../../../lib/format";
import { absoluteTime } from "../../utils/absoluteTime";

export type CommentCardProps = {
	comment: Comment;
	// The identifier of the comment's ticket, for the timeline cache.
	identifier?: string;
	onEdited?: (comment: Comment) => void;
	onDeleted?: (id: string) => void;
	formatClassName?: "markdown" | "comment-markdown";
	actions?: readonly MenuItem[];
	className?: string;
};

// A folded body keeps this much height before the show-more control.
const foldedBodyHeight = 240;

// One flat row: the actor, the time, and the menu on one line, then the
// body. A long body folds behind a show-more control.
export function CommentCard({
	comment,
	onEdited,
	onDeleted,
	formatClassName,
	actions = [],
	className,
}: CommentCardProps) {
	const { client } = useApp();
	const [editing, setEditing] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [draft, setDraft] = useState(comment.body);
	const [expanded, setExpanded] = useState(false);
	const [foldable, setFoldable] = useState(false);
	// A new body remounts the measured node, so the fold remeasures.
	const measureBody = useCallback((element: HTMLDivElement | null) => {
		if (element !== null) setFoldable(element.scrollHeight > foldedBodyHeight + 8);
	}, []);

	const save = async () => {
		try {
			const updated = await client.comments.update({ id: comment.id, body: draft });
			setEditing(false);
			onEdited?.(updated);
		} catch (error) {
			failToast("The comment is not saved.", error, () => void save());
		}
	};

	const remove = async () => {
		try {
			await client.comments.delete({ id: comment.id });
			onDeleted?.(comment.id);
		} catch (error) {
			failToast("The comment is not deleted.", error, () => void remove());
		}
	};

	const folded = foldable && !expanded;
	const body = editing ? (
		<div className="flex flex-col gap-2 pb-3">
			<Textarea
				label="Edit comment"
				hideLabel
				rows={4}
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
			/>
			<div className="flex justify-end gap-2">
				<Button size="sm" variant="quiet" onClick={() => setEditing(false)}>
					Cancel
				</Button>
				<Button size="sm" variant="primary" onClick={() => void save()}>
					Save
				</Button>
			</div>
		</div>
	) : (
		<div className="flex flex-col items-start gap-1">
			<div
				key={comment.body}
				ref={measureBody}
				data-comment-body=""
				className={cx("w-full text-base", folded && "max-h-60 overflow-hidden")}
			>
				<ReadOnlyMarkdown markdown={comment.body} formatClassName={formatClassName} />
			</div>
			{foldable && (
				<Button size="sm" variant="quiet" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
					{expanded ? "Show less" : "Show more"}
				</Button>
			)}
			{comment.notifications?.map((notification) => (
				<p key={notification.runId} className="text-xs text-fg-muted" title={notification.error ?? undefined}>
					@{notification.personaName}:{" "}
					{notification.state === "sent"
						? "Notified"
						: notification.state === "failed"
							? "Not delivered. The assignment closed or changed."
							: notification.state === "unknown"
								? "Delivery uncertain. Check the agent before another mention."
								: "Queued"}
				</p>
			))}
		</div>
	);

	return (
		<li>
			<article
				aria-label={`Comment by ${comment.actor.displayName ?? comment.actor.name}`}
				data-kind="comment"
				className={cx("relative", className)}
			>
				<header className="relative flex h-8 items-center gap-2 text-sm">
					{comment.actor.kind !== "system" && (
						<ActorChip compact name={comment.actor.displayName ?? comment.actor.name} kind={comment.actor.kind} />
					)}
					<time dateTime={comment.createdAt} title={absoluteTime(comment.createdAt)} className="text-fg-muted tabular">
						{compactRelativeTime(comment.createdAt)}
					</time>
					<div className="ml-auto">
						<Menu
							label="Comment actions"
							items={[
								...actions,
								{ label: "Edit", onSelect: () => setEditing(true) },
								{ label: "Copy markdown", onSelect: () => void copyText(comment.body, "Copied the comment") },
								{ label: "Delete", onSelect: () => setConfirming(true), danger: true },
							]}
						/>
					</div>
				</header>
				{body}
				<ConfirmDialog
					open={confirming}
					title="Delete this comment?"
					description="trellis cannot restore a deleted comment."
					confirmLabel="Delete"
					danger
					onConfirm={() => {
						setConfirming(false);
						void remove();
					}}
					onCancel={() => setConfirming(false)}
				/>
			</article>
		</li>
	);
}
