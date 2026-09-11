import { useQuery } from "@tanstack/react-query";
import type { Comment, CommentThread as ThreadData } from "@trellis/api";
import { Button, Textarea } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { failToast } from "../../../utils/failToast";
import { CommentCard } from "../CommentCard";

type CommentThreadProps = {
	id: string;
	identifier: string;
	comments: Comment[];
	showActor: boolean;
	onEdited: (comment: Comment) => void;
	onDeleted: (id: string) => void;
	onCreated: (comment: Comment) => void;
};

// A reply can appear on a newer timeline page than its root. The thread query
// supplies the root and every reply until the loaded pages include the root.
export function CommentThread({
	id,
	identifier,
	comments,
	showActor,
	onEdited,
	onDeleted,
	onCreated,
}: CommentThreadProps) {
	const { client, orpc, queryClient } = useApp();
	const loadedRoot = comments.find((comment) => comment.id === id);
	const options = orpc.comments.thread.queryOptions({ input: { id } });
	const thread = useQuery({
		...options,
		enabled: loadedRoot === undefined,
	});
	const edit = (comment: Comment) => {
		queryClient.setQueryData<ThreadData>(options.queryKey, (data) =>
			data === undefined
				? data
				: {
						root: data.root.id === comment.id ? comment : data.root,
						replies: data.replies.map((reply) => (reply.id === comment.id ? comment : reply)),
					},
		);
		onEdited(comment);
	};
	const remove = (commentId: string) => {
		queryClient.setQueryData<ThreadData>(options.queryKey, (data) =>
			data === undefined
				? data
				: {
						...data,
						replies: data.replies.filter((reply) => reply.id !== commentId),
					},
		);
		onDeleted(commentId);
	};
	const root = loadedRoot ?? thread.data?.root;
	const replies =
		loadedRoot === undefined ? (thread.data?.replies ?? []) : comments.filter((comment) => comment.id !== id);
	const [replyOpen, setReplyOpen] = useState(false);
	const [draft, setDraft] = useState("");
	const [posting, setPosting] = useState(false);
	const [expandedResolved, setExpandedResolved] = useState(false);
	const [resolving, setResolving] = useState(false);

	if (root === undefined)
		return (
			<li className="py-3 text-sm text-fg-muted">
				{thread.isError ? "The thread could not load." : "Loading thread…"}
			</li>
		);
	const resolved = root.resolvedAt !== null;

	const post = async () => {
		setPosting(true);
		try {
			const reply = await client.comments.create({ ticket: identifier, parentId: root.id, body: draft.trim() });
			queryClient.setQueryData<ThreadData>(options.queryKey, (data) =>
				data === undefined || data.replies.some((item) => item.id === reply.id)
					? data
					: { ...data, replies: [...data.replies, reply] },
			);
			onCreated(reply);
			setDraft("");
			setReplyOpen(false);
		} catch (error) {
			failToast("The reply is not saved.", error, () => void post());
		}
		setPosting(false);
	};

	const resolve = async () => {
		setResolving(true);
		try {
			const updated = await client.comments.resolve({ id: root.id, resolved: !resolved });
			edit(updated);
			setExpandedResolved(false);
		} catch (error) {
			failToast("The thread is not updated.", error, () => void resolve());
		}
		setResolving(false);
	};

	return (
		<li>
			{resolved && (
				<Button
					size="sm"
					variant="quiet"
					aria-expanded={expandedResolved}
					onClick={() => setExpandedResolved(!expandedResolved)}
				>
					Resolved thread · {replies.length} {replies.length === 1 ? "reply" : "replies"}
				</Button>
			)}
			{(!resolved || expandedResolved) && (
				<>
					<ul>
						<CommentCard
							comment={root}
							showActor={showActor || resolved}
							formatClassName="comment-markdown"
							onEdited={edit}
							onDeleted={remove}
						/>
					</ul>
					{replies.length > 0 && (
						<ul aria-label="Replies" className="pl-6">
							{replies.map((reply, index) => (
								<CommentCard
									key={reply.id}
									comment={reply}
									showActor={
										index === 0 ||
										replies[index - 1]!.actor.name !== reply.actor.name ||
										replies[index - 1]!.actor.kind !== reply.actor.kind
									}
									formatClassName="comment-markdown"
									onEdited={edit}
									onDeleted={remove}
								/>
							))}
						</ul>
					)}
					<div className="flex items-center gap-2 pb-2">
						<Button size="sm" variant="quiet" onClick={() => setReplyOpen(true)}>
							Reply
						</Button>
						<Button size="sm" variant="quiet" disabled={resolving} onClick={() => void resolve()}>
							{resolved ? "Reopen thread" : "Resolve thread"}
						</Button>
					</div>
					{replyOpen && (
						<div className="flex flex-col gap-2 pb-3 pl-6">
							<Textarea
								label="Reply"
								hideLabel
								placeholder="Write a reply…"
								value={draft}
								onChange={(event) => setDraft(event.target.value)}
								rows={3}
								onKeyDown={(event) => {
									if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && draft.trim() !== "" && !posting) {
										event.preventDefault();
										void post();
									}
								}}
							/>
							<div className="flex justify-end gap-2">
								<Button size="sm" variant="quiet" onClick={() => setReplyOpen(false)}>
									Cancel
								</Button>
								<Button
									size="sm"
									variant="primary"
									disabled={posting || draft.trim() === ""}
									onClick={() => void post()}
								>
									Post reply
								</Button>
							</div>
						</div>
					)}
				</>
			)}
		</li>
	);
}
