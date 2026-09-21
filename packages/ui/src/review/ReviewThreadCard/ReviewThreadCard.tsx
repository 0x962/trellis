import { ArrowCounterClockwise, ArrowUp, Check, Copy, PencilSimple } from "@phosphor-icons/react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "../../primitives/Button";
import { IconButton } from "../../primitives/IconButton";
import { Textarea } from "../../primitives/Textarea";
import { Tooltip } from "../../primitives/Tooltip";
import { ReviewReactions } from "../ReviewReactions/ReviewReactions";

type Message = {
	id: string;
	author: string;
	kind: string;
	session: string | null;
	body: string;
	createdAt: string;
	version: number;
	reactions: { reaction: string; author: string; kind: string }[];
};
type Props = {
	thread: Message & { replies: Message[]; status: string; resolvedBy: string | null };
	// `root` is true for the first message, the one that carries the anchor
	// and any suggestion the thread applies.
	renderBody: (body: string, message: { id: string; root: boolean }) => ReactNode;
	onReply: (body: string) => Promise<unknown>;
	onResolve: () => Promise<unknown>;
	onEdit: (id: string, body: string, version: number) => Promise<unknown>;
	onReaction: (id: string, reaction: string, remove: boolean) => Promise<unknown>;
	actor?: string;
};
// The first line of a body, for the collapsed row of a resolved thread. A
// body that opens with a suggestion block names the change instead.
const summaryOf = (body: string) => {
	const first = body.split("\n")[0] ?? "";
	return /^\s*(`{3,}|~{3,})\s*suggestion/i.test(first) ? "Suggested change" : first;
};

export function ReviewThreadCard({ thread, renderBody, onReply, onResolve, onEdit, onReaction, actor }: Props) {
	const root = useRef<HTMLElement>(null);
	const replyInput = useRef<HTMLTextAreaElement>(null);
	const draftKey = `trellis.review.reply:${actor}:${thread.id}`;
	const [reply, updateReply] = useState(() => localStorage.getItem(draftKey) ?? "");
	const setReply = (body: string) => {
		updateReply(body);
		if (body) localStorage.setItem(draftKey, body);
		else localStorage.removeItem(draftKey);
	};
	const [edit, setEdit] = useState<{ id: string; body: string; version: number } | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [expanded, setExpanded] = useState(false);
	const run = async (action: () => Promise<unknown>) => {
		setBusy(true);
		setError(null);
		try {
			await action();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	};
	return (
		<article
			ref={root}
			tabIndex={-1}
			className="review-thread"
			id={`thread-${thread.id}`}
			aria-label={`Thread by ${thread.author}`}
		>
			{thread.status === "resolved" && (
				<button
					type="button"
					className="review-resolved"
					aria-expanded={expanded}
					onClick={() => setExpanded(!expanded)}
				>
					Resolved by {thread.resolvedBy} · {summaryOf(thread.body)}
				</button>
			)}
			{(thread.status !== "resolved" || expanded) && (
				<>
					{[thread, ...thread.replies].map((message) => (
						<section className="review-message" key={message.id}>
							<header>
								<strong>{message.author}</strong>
								<span className="review-meta">
									{message.kind} · {new Date(message.createdAt).toLocaleDateString()}
								</span>
								{message.session && (
									<Tooltip content={`Copy session ${message.session}`}>
										<IconButton
											className="review-message-action"
											label="Copy session"
											icon={<Copy />}
											onClick={() => void navigator.clipboard.writeText(message.session!)}
										/>
									</Tooltip>
								)}
								<Tooltip content="Edit message">
									<IconButton
										className="review-message-action"
										label="Edit message"
										icon={<PencilSimple />}
										disabled={busy}
										onClick={() => setEdit({ id: message.id, body: message.body, version: message.version })}
									/>
								</Tooltip>
							</header>
							{edit?.id === message.id ? (
								<form
									onSubmit={(e) => {
										e.preventDefault();
										void run(async () => {
											await onEdit(edit.id, edit.body, edit.version);
											setEdit(null);
										});
									}}
								>
									<Textarea
										label="Edit message"
										value={edit.body}
										onChange={(e) => setEdit({ ...edit, body: e.target.value })}
									/>
									<div className="review-form-actions">
										<Button type="button" onClick={() => setEdit(null)}>
											Cancel
										</Button>
										<Button type="submit" disabled={busy || !edit.body.trim()}>
											Save
										</Button>
									</div>
								</form>
							) : (
								renderBody(message.body, { id: message.id, root: message.id === thread.id })
							)}
							<ReviewReactions
								reactions={message.reactions}
								actor={actor}
								busy={busy}
								onReaction={(reaction, remove) => void run(() => onReaction(message.id, reaction, remove))}
							/>
						</section>
					))}
					<form
						className="review-reply"
						onSubmit={(e) => {
							e.preventDefault();
							void run(async () => {
								await onReply(reply);
								setReply("");
								replyInput.current?.focus({ preventScroll: true });
							});
						}}
					>
						<textarea
							ref={replyInput}
							aria-label="Reply"
							placeholder="Leave a reply…"
							value={reply}
							onChange={(e) => setReply(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim() && !busy) {
									e.preventDefault();
									e.currentTarget.form?.requestSubmit();
								}
							}}
						/>
						<Tooltip content="Post reply">
							<IconButton type="submit" label="Post reply" icon={<ArrowUp />} disabled={busy || !reply.trim()} />
						</Tooltip>
						<Tooltip content={thread.status === "resolved" ? "Reopen comment" : "Resolve comment"}>
							<IconButton
								label={thread.status === "resolved" ? "Reopen comment" : "Resolve comment"}
								icon={thread.status === "resolved" ? <ArrowCounterClockwise /> : <Check />}
								disabled={busy}
								onClick={() =>
									void run(async () => {
										await onResolve();
										root.current?.focus({ preventScroll: true });
									})
								}
							/>
						</Tooltip>
					</form>
				</>
			)}
			{error && (
				<p role="alert" className="review-error">
					{error}
				</p>
			)}
		</article>
	);
}
