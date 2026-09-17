import type { Comment } from "@trellis/api";
import { ActorChip, Button, ConfirmDialog, cx, Menu, type MenuItem, Textarea } from "@trellis/ui";
import { type ReactNode, useState } from "react";
import { ReadOnlyMarkdown } from "../../../../../components/ReadOnlyMarkdown";
import { useApp } from "../../../../../lib/appContext";
import { copyText } from "../../../../../lib/clipboard";
import { failToast } from "../../../../../lib/failToast";
import { compactRelativeTime } from "../../../../../lib/format";
import { absoluteTime } from "../../utils/absoluteTime";
import { notificationText } from "../../utils/notificationText";

export type CommentCardProps = {
	comment: Comment;
	showActor?: boolean;
	// The identifier of the comment's ticket, for the timeline cache.
	identifier?: string;
	onEdited?: (comment: Comment) => void;
	onDeleted?: (id: string) => void;
	formatClassName?: "markdown" | "comment-markdown";
	actions?: readonly MenuItem[];
	className?: string;
	threadSurface?: boolean;
	children?: ReactNode;
};

// The timestamp exposes the absolute time in its title.
export function CommentCard({
	comment,
	showActor = true,
	onEdited,
	onDeleted,
	formatClassName,
	actions = [],
	className,
	threadSurface = false,
	children,
}: CommentCardProps) {
	const { client } = useApp();
	const [editing, setEditing] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [draft, setDraft] = useState(comment.body);

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
		<div className="text-base">
			<ReadOnlyMarkdown markdown={comment.body} formatClassName={formatClassName} />
			{comment.notifications?.map((notification) => (
				<p
					key={`${notification.personaName}-${notification.runId ?? "pending"}`}
					className="mt-2 text-xs text-fg-muted"
				>
					@{notification.personaName}: {notificationText(notification)}
				</p>
			))}
		</div>
	);

	return (
		<li>
			<article
				aria-label={`Comment by ${comment.actor.displayName ?? comment.actor.name}`}
				data-kind="comment"
				className={cx("relative", !threadSurface && "py-3", className)}
			>
				<header className="relative flex h-8 items-center gap-2 text-sm">
					{showActor && comment.actor.kind !== "system" && (
						<ActorChip
							compact
							className="gap-2.5"
							name={comment.actor.displayName ?? comment.actor.name}
							kind={comment.actor.kind}
						/>
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
				{threadSurface ? (
					<div data-thread-surface="" className="relative ml-7">
						<div className="overflow-hidden rounded-md border border-border bg-surface shadow-sm">
							<div className="px-4 pt-3 pb-4">{body}</div>
							{children}
						</div>
					</div>
				) : (
					body
				)}
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
