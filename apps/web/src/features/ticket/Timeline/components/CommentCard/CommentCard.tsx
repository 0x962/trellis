import type { Comment } from "@trellis/api";
import { ActorChip, Button, cx, Menu, Textarea } from "@trellis/ui";
import { useState } from "react";
import { isLiveActor } from "../../../../../lib/actorLive";
import { useApp } from "../../../../../lib/appContext";
import { copyText } from "../../../../../lib/clipboard";
import { compactRelativeTime } from "../../../../../lib/format";
import { ReadOnlyMarkdown } from "../../../Description/components/ReadOnlyMarkdown";
import { failToast } from "../../../utils/failToast";
import { absoluteTime } from "../../utils/absoluteTime";

export type CommentCardProps = {
	comment: Comment;
	// The identifier of the comment's ticket, for the timeline cache.
	identifier?: string;
	onEdited?: (comment: Comment) => void;
	onDeleted?: (id: string) => void;
	formatClassName?: "markdown" | "comment-markdown";
};

// One comment: the actor, the relative time with the absolute time as its
// title, the markdown body, and the menu. An agent's card carries the
// agent-colored left border, so who said what stays legible at speed.
export function CommentCard({ comment, onEdited, onDeleted, formatClassName }: CommentCardProps) {
	const { client } = useApp();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(comment.body);
	const agent = comment.actor.kind === "agent";

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
			<article
				data-kind="comment"
				className={cx(
					"my-1.5 overflow-hidden rounded-md border border-border border-l-2",
					agent ? "border-l-agent" : "border-l-border",
				)}
			>
				<header className="flex h-8 items-center gap-2 px-3 text-sm">
					{comment.actor.kind !== "system" && (
						<ActorChip
							name={comment.actor.name}
							kind={comment.actor.kind}
							live={isLiveActor({ kind: comment.actor.kind, at: comment.createdAt })}
						/>
					)}
					<time
						dateTime={comment.createdAt}
						title={absoluteTime(comment.createdAt)}
						className="ml-auto text-fg-faint tabular"
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
					<div className="flex flex-col gap-2 px-3 pb-3">
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
					<ReadOnlyMarkdown markdown={comment.body} className="px-3 pb-3 text-base" formatClassName={formatClassName} />
				)}
			</article>
		</li>
	);
}
