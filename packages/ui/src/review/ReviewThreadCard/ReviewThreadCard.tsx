import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import { foldedLine, isCollapsible } from "./foldedLine";
import { ThreadMessage } from "./ThreadMessage";
import { ThreadReplyForm } from "./ThreadReplyForm";
import type { Edit, Message, Thread } from "./thread";

type Props = {
	thread: Thread;
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
	const foldedReopen = useRef<HTMLButtonElement>(null);
	const formResolve = useRef<HTMLButtonElement>(null);
	const draftKey = `trellis.review.reply:${actor}:${thread.id}`;
	const [reply, updateReply] = useState(() => localStorage.getItem(draftKey) ?? "");
	const setReply = (body: string) => {
		updateReply(body);
		if (body) localStorage.setItem(draftKey, body);
		else localStorage.removeItem(draftKey);
	};
	const [edit, setEdit] = useState<Edit | null>(null);
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
	const folded = isCollapsible(thread.status, outdated !== undefined) && !holdOpen;
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
	// A finger and a pen leave the card at the end of the tap, before the
	// click, so `onPointerLeave` cannot tell a held card when to fold. The
	// next press outside the card does it. The press that starts the hold is
	// inside the card, and this listener is added after it, so the hold
	// survives its own tap. Focus stays where the press sends it, because the
	// press is the reader going somewhere else.
	useEffect(() => {
		if (!holdOpen) return;
		const foldOnOutsidePress = (event: PointerEvent) => {
			if (root.current?.contains(event.target as Node) === true) return;
			setHoldOpen(false);
		};
		document.addEventListener("pointerdown", foldOnOutsidePress, true);
		return () => document.removeEventListener("pointerdown", foldOnOutsidePress, true);
	}, [holdOpen]);
	const messages: Message[] = [thread, ...thread.replies];
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
			onPointerLeave={(event) => {
				// A mouse leaves the card when the reader moves it away. A
				// finger and a pen leave it at the end of every tap, which says
				// nothing about where the reader is, so the effect above folds a
				// held card for them.
				if (event.pointerType !== "mouse") return;
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
					{messages.map((message) => (
						<ThreadMessage
							key={message.id}
							message={message}
							root={message.id === thread.id}
							renderBody={renderBody}
							busy={busy}
							canChange={canChange(message.id)}
							actor={actor}
							edit={edit}
							setEdit={setEdit}
							run={run}
							onEdit={onEdit}
							onDelete={onDelete}
							onReaction={onReaction}
						/>
					))}
					<ThreadReplyForm
						reply={reply}
						setReply={setReply}
						busy={busy}
						resolving={resolving}
						resolved={thread.status === "resolved"}
						onReply={onReply}
						run={run}
						toggleResolved={toggleResolved}
						resolveRef={formResolve}
					/>
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
