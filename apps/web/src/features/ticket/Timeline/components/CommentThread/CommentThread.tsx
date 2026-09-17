import { ArrowUp, CheckCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { Comment, CommentThread as ThreadData } from "@trellis/api";
import { Avatar, Button, IconButton } from "@trellis/ui";
import { useState } from "react";
import { useActor } from "../../../../../lib/actor";
import { useApp } from "../../../../../lib/appContext";
import { failToast } from "../../../../../lib/failToast";
import { CommentCard } from "../CommentCard";

type CommentThreadProps = {
	id: string;
	identifier: string;
	comments: Comment[];
	previousComment?: Comment;
	onEdited: (comment: Comment) => void;
	onDeleted: (id: string) => void;
	onCreated: (comment: Comment) => void;
};

const sameActor = (left: Comment, right: Comment) =>
	left.actor.kind === right.actor.kind && left.actor.name === right.actor.name;

// A reply can appear on a newer timeline page than its root. The thread query
// supplies the root and every reply until the loaded pages include the root.
export function CommentThread({
	id,
	identifier,
	comments,
	previousComment,
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
	const actor = useActor()!;
	const [draft, setDraft] = useState("");
	const [posting, setPosting] = useState(false);
	const [expandedResolved, setExpandedResolved] = useState(false);
	const [resolving, setResolving] = useState(false);

	if (root === undefined)
		return (
			<li data-stream-entry="comment" className="py-1 text-sm text-fg-muted">
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
		<li data-stream-entry="comment">
			{resolved && (
				<Button
					size="sm"
					variant="default"
					icon={<CheckCircle />}
					aria-expanded={expandedResolved}
					onClick={() => setExpandedResolved(!expandedResolved)}
				>
					Resolved thread · {replies.length} {replies.length === 1 ? "reply" : "replies"}
				</Button>
			)}
			{(!resolved || expandedResolved) && (
				<fieldset aria-label={`Thread started by ${root.actor.displayName ?? root.actor.name}`} className="contents">
					<ul aria-label="Thread comments">
						<li>
							<CommentCard
								comment={root}
								formatClassName="comment-markdown"
								showActor={previousComment === undefined || !sameActor(previousComment, root)}
								onEdited={edit}
								onDeleted={remove}
								actions={[
									{
										label: resolved ? "Reopen thread" : "Resolve thread",
										disabled: resolving,
										onSelect: () => void resolve(),
									},
								]}
							/>
						</li>
						{replies.length > 0 && (
							<li className="mt-1 ml-2 border-l border-border pl-5">
								<ul aria-label="Replies">
									{replies.map((reply, index) => (
										<li key={reply.id}>
											<CommentCard
												comment={reply}
												formatClassName="comment-markdown"
												onEdited={edit}
												onDeleted={remove}
												showActor={!sameActor(index === 0 ? root : replies[index - 1]!, reply)}
											/>
										</li>
									))}
								</ul>
							</li>
						)}
					</ul>
					<form
						aria-label="Leave a reply"
						className="mt-1 flex min-h-11 items-start gap-2 py-2 focus-within:bg-surface"
						onSubmit={(event) => {
							event.preventDefault();
							if (draft.trim() !== "" && !posting) void post();
						}}
					>
						<Avatar name={actor.name} kind={actor.kind} className="mt-1.5" />
						<textarea
							aria-label="Reply"
							placeholder="Reply. Use @persona to notify an assigned agent."
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							rows={1}
							className="min-h-7 max-h-40 min-w-0 flex-1 resize-none bg-transparent py-1 text-base leading-5 text-fg outline-none placeholder:text-fg-faint [field-sizing:content] focus-visible:outline-2 focus-visible:outline-accent"
							onKeyDown={(event) => {
								if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && draft.trim() !== "" && !posting) {
									event.preventDefault();
									void post();
								}
							}}
						/>
						<IconButton
							label="Post reply"
							icon={<ArrowUp />}
							variant="primary"
							disabled={posting || draft.trim() === ""}
							type="submit"
						/>
					</form>
				</fieldset>
			)}
		</li>
	);
}
