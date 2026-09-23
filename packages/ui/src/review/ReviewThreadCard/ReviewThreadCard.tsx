import { ArrowCounterClockwise, ArrowUp, Check, Copy, PencilSimple, Trash } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "../../primitives/Button";
import { IconButton } from "../../primitives/IconButton";
import { Textarea } from "../../primitives/Textarea";
import { Tooltip } from "../../primitives/Tooltip";
import { writeClipboard } from "../../utils/writeClipboard";
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
	// How far this message got on its way to the agents of the pull request.
	// A message that Trellis sends to no agent holds nothing here.
	delivery?: { state: string; error: string | null } | null;
};
// The word a reader sees for each state of a send to an agent.
const deliveryWords: Record<string, string> = {
	pending: "sending",
	sending: "sending",
	held: "waits for an agent",
	sent: "sent",
	failed: "failed",
	unknown: "not confirmed",
};
type Props = {
	thread: Message & { replies: Message[]; status: string; resolvedBy: string | null };
	// `root` is true for the first message, the one that carries the anchor
	// and any suggestion the thread applies.
	renderBody: (body: string, message: { id: string; root: boolean }) => ReactNode;
	onReply: (body: string) => Promise<unknown>;
	onResolve: () => Promise<unknown>;
	onEdit: (id: string, body: string, version: number) => Promise<unknown>;
	// A thread without reactions draws no reaction row.
	onReaction?: (id: string, reaction: string, remove: boolean) => Promise<unknown>;
	// Deletes one message. A thread without it draws no delete button.
	onDelete?: (id: string) => Promise<unknown>;
	// Whether the reader may edit and delete a message. Every message when
	// it is not given.
	canChange?: (id: string) => boolean;
	actor?: string;
	// The file and the line the thread points at, such as `src/app.ts:42`.
	// The one line of a folded thread names it.
	anchor?: string;
	// Set when the file on screen holds the lines this thread was written
	// against no more. `lines` is the text of those lines, and it is empty
	// when Trellis kept the diff of that time no more. The card folds such a
	// thread and prints those lines above it.
	outdated?: { lines: string[] };
};
// The first line of a body, for the collapsed row of a resolved thread. A
// body that opens with a suggestion block names the change instead.
const summaryOf = (body: string) => {
	const first = body.split("\n")[0] ?? "";
	return /^\s*(`{3,}|~{3,})\s*suggestion/i.test(first) ? "Suggested change" : first;
};

// The one line of a folded thread: why it is folded, who wrote it, the file
// and the line it points at, and the words it opens with. `resolvedBy` is
// null for the moment between the click and the server's answer, because
// only the server writes the name of the person who resolved the thread.
const foldedLine = (thread: Props["thread"], anchor: string | undefined, outdated: boolean, body: string): string =>
	[
		outdated ? "Outdated" : null,
		thread.status === "resolved"
			? thread.resolvedBy === null
				? "Resolved"
				: `Resolved by ${thread.resolvedBy}`
			: null,
		thread.author,
		anchor,
		summaryOf(body),
	]
		.filter((part) => part !== null && part !== undefined && part !== "")
		.join(" · ");

export function ReviewThreadCard({
	thread,
	renderBody,
	onReply,
	onResolve,
	onEdit,
	onReaction,
	onDelete,
	canChange = () => true,
	actor,
	anchor,
	outdated,
}: Props) {
	const root = useRef<HTMLElement>(null);
	const replyInput = useRef<HTMLTextAreaElement>(null);
	const foldedReopen = useRef<HTMLButtonElement>(null);
	const formResolve = useRef<HTMLButtonElement>(null);
	const draftKey = `trellis.review.reply:${actor}:${thread.id}`;
	const [reply, updateReply] = useState(() => localStorage.getItem(draftKey) ?? "");
	const setReply = (body: string) => {
		updateReply(body);
		if (body) localStorage.setItem(draftKey, body);
		else localStorage.removeItem(draftKey);
	};
	const [edit, setEdit] = useState<{ id: string; body: string; version: number } | null>(null);
	const [busy, setBusy] = useState(false);
	const [resolving, setResolving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [expanded, setExpanded] = useState(false);
	// True from the click that resolves a thread under the mouse pointer
	// until the pointer leaves the card. While it is true the card draws
	// every message, so it keeps the height and the place it had at the
	// click and no later card moves up under the pointer.
	const [holdOpen, setHoldOpen] = useState(false);
	// Set when an action removed the control the person was standing on, so
	// the effect below moves focus to the control that replaced it.
	const moveFocus = useRef(false);
	// A ref, not state: the card must not draw again when the pointer enters or leaves.
	const pointerInside = useRef(false);
	// A resolved thread and a thread the file on screen holds no more both
	// open as one line, so neither takes the room of a thread the reader must
	// still act on.
	const collapsible = thread.status === "resolved" || outdated !== undefined;
	const folded = collapsible && !holdOpen;
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
	// Resolves the thread, or reopens it. The card draws the new status
	// before `onResolve` answers, so the only wait is the network, and a
	// second click while the first call is out does nothing.
	const toggleResolved = () => {
		if (resolving) return;
		if (pointerInside.current) setHoldOpen(true);
		moveFocus.current = true;
		setResolving(true);
		setError(null);
		onResolve()
			.catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
			.finally(() => setResolving(false));
	};
	// The fold and the unfold each remove the button that caused them. This
	// puts focus on the button that took its place: the reopen button of the
	// one line when the card folded, and the resolve button of the reply form
	// when it opened.
	useEffect(() => {
		if (!moveFocus.current) return;
		moveFocus.current = false;
		(foldedReopen.current ?? formResolve.current)?.focus({ preventScroll: true });
	});
	return (
		<article
			ref={root}
			tabIndex={-1}
			className="review-thread"
			id={`thread-${thread.id}`}
			aria-label={`Thread by ${thread.author}`}
			onPointerEnter={() => {
				pointerInside.current = true;
			}}
			onPointerLeave={() => {
				pointerInside.current = false;
				if (!holdOpen) return;
				moveFocus.current = root.current?.contains(document.activeElement) === true;
				setHoldOpen(false);
			}}
		>
			{folded && (
				<div className="review-folded">
					<button
						type="button"
						className="review-resolved"
						aria-expanded={expanded}
						onClick={() => setExpanded(!expanded)}
					>
						{foldedLine(thread, anchor, outdated !== undefined, thread.body)}
					</button>
					{thread.status === "resolved" && (
						<Tooltip content="Reopen comment">
							<IconButton
								ref={foldedReopen}
								label="Reopen comment"
								icon={<ArrowCounterClockwise />}
								disabled={resolving}
								// The button stays in the tab order while the call is out, so focus stays on it.
								focusableWhenDisabled
								onClick={toggleResolved}
							/>
						</Tooltip>
					)}
				</div>
			)}
			{outdated !== undefined && outdated.lines.length > 0 && (
				<figure className="review-thread-outdated">
					<figcaption className="sr-only">The code this comment was written against</figcaption>
					<pre>{outdated.lines.join("\n")}</pre>
				</figure>
			)}
			{(!folded || expanded) && (
				<>
					{[thread, ...thread.replies].map((message) => (
						<section className="review-message" key={message.id}>
							<header>
								<strong>{message.author}</strong>
								<span className="review-meta">
									{message.kind} · {new Date(message.createdAt).toLocaleDateString()}
								</span>
								{message.delivery && (
									<span
										className="review-delivery"
										data-state={message.delivery.state}
										title={message.delivery.error ?? undefined}
									>
										{deliveryWords[message.delivery.state]}
									</span>
								)}
								{message.session && (
									<Tooltip content={`Copy session ${message.session}`}>
										<IconButton
											className="review-message-action"
											label="Copy session"
											icon={<Copy />}
											onClick={() => void writeClipboard(message.session!)}
										/>
									</Tooltip>
								)}
								{canChange(message.id) && (
									<Tooltip content="Edit message">
										<IconButton
											className="review-message-action"
											label="Edit message"
											icon={<PencilSimple />}
											disabled={busy}
											onClick={() => setEdit({ id: message.id, body: message.body, version: message.version })}
										/>
									</Tooltip>
								)}
								{onDelete !== undefined && canChange(message.id) && (
									<Tooltip content={message.id === thread.id ? "Delete thread" : "Delete message"}>
										<IconButton
											className="review-message-action"
											label={message.id === thread.id ? "Delete thread" : "Delete message"}
											icon={<Trash />}
											disabled={busy}
											onClick={() => void run(() => onDelete(message.id))}
										/>
									</Tooltip>
								)}
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
							{onReaction !== undefined && (
								<ReviewReactions
									reactions={message.reactions}
									actor={actor}
									busy={busy}
									onReaction={(reaction, remove) => void run(() => onReaction(message.id, reaction, remove))}
								/>
							)}
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
								ref={formResolve}
								label={thread.status === "resolved" ? "Reopen comment" : "Resolve comment"}
								icon={thread.status === "resolved" ? <ArrowCounterClockwise /> : <Check />}
								disabled={resolving}
								// The button stays in the tab order while the call is out, so focus stays on it.
								focusableWhenDisabled
								onClick={toggleResolved}
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
