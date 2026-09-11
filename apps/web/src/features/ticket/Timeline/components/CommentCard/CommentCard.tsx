import type { Comment } from "@trellis/api";
import { ActorChip, Button, cx, Menu, Textarea } from "@trellis/ui";
import { useId, useState } from "react";
import { isLiveActor } from "../../../../../lib/actorLive";
import { useApp } from "../../../../../lib/appContext";
import { copyText } from "../../../../../lib/clipboard";
import { compactRelativeTime } from "../../../../../lib/format";
import { ReadOnlyMarkdown } from "../../../Description/components/ReadOnlyMarkdown";
import { failToast } from "../../../utils/failToast";
import { absoluteTime } from "../../utils/absoluteTime";

export type CommentCardProps = {
	comment: Comment;
	showActor?: boolean;
	// The identifier of the comment's ticket, for the timeline cache.
	identifier?: string;
	onEdited?: (comment: Comment) => void;
	onDeleted?: (id: string) => void;
	formatClassName?: "markdown" | "comment-markdown";
};

// The timestamp exposes the absolute time in its title.
export function CommentCard({ comment, showActor = true, onEdited, onDeleted, formatClassName }: CommentCardProps) {
	const { client } = useApp();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(comment.body);
	const [expanded, setExpanded] = useState(false);
	const bodyId = useId();
	const long = comment.body.length > 700 || comment.body.split("\n").length > 8;

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

	return (
		<li>
			<article aria-label={`Comment by ${comment.actor.name}`} data-kind="comment" className="py-3">
				<header className="flex h-8 items-center gap-2 text-sm">
					{showActor && comment.actor.kind !== "system" && (
						<ActorChip
							compact
							name={comment.actor.name}
							kind={comment.actor.kind}
							live={isLiveActor({ kind: comment.actor.kind, at: comment.createdAt })}
						/>
					)}
					<time
						dateTime={comment.createdAt}
						title={absoluteTime(comment.createdAt)}
						className="ml-auto text-fg-muted tabular"
					>
						{compactRelativeTime(comment.createdAt)}
					</time>
					<Menu
						label="Comment actions"
						items={[
							{ label: "Edit", onSelect: () => setEditing(true) },
							{ label: "Copy markdown", onSelect: () => void copyText(comment.body, "Copied the comment") },
							{ label: "Delete", onSelect: () => void remove(), danger: true },
						]}
					/>
				</header>
				{editing ? (
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
					<>
						<div id={bodyId} className={cx("text-base", long && !expanded && "max-h-60 overflow-hidden")}>
							<ReadOnlyMarkdown markdown={comment.body} formatClassName={formatClassName} />
						</div>
						{long && (
							<Button
								size="sm"
								variant="quiet"
								aria-controls={bodyId}
								aria-expanded={expanded}
								onClick={() => setExpanded(!expanded)}
							>
								{expanded ? "Show less" : "Show more"}
							</Button>
						)}
					</>
				)}
			</article>
		</li>
	);
}
