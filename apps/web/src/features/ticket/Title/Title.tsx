import type { Ticket } from "@trellis/api";
import { cx } from "@trellis/ui";
import { type ClipboardEvent, type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { conflictCurrent } from "../../../lib/conflict";
import { ConflictNotice } from "../components/ConflictNotice";
import { useTicketWrite } from "../hooks/useTicketWrite";
import { failToast } from "../utils/failToast";

export type TitleProps = {
	ticket: Ticket;
	// The peek focuses the title when it opens.
	autoFocus?: boolean;
	className?: string;
};

type Conflict = { current: Ticket; title: string };

// A title is one line of text. A pasted line break becomes a space.
const oneLine = (text: string) => text.replace(/\s*[\r\n]+\s*/g, " ");

// A browser without `field-sizing` keeps a textarea at its row count, so
// the height follows the content by hand.
const fitHeight = (element: HTMLTextAreaElement) => {
	element.style.height = "auto";
	element.style.height = `${element.scrollHeight}px`;
};

// The 24 px title. It wraps onto as many lines as it needs, so it is a
// textarea, but it holds one line of text: Enter saves and adds no newline.
// Enter and blur save it once with the row's version; Escape puts the
// stored title back; an empty field saves nothing. The field draws no
// border and no ring in any state, so the caret is the focus signal. A 412
// shows the conflict notice with the actor who won.
export function Title({ ticket, autoFocus = false, className }: TitleProps) {
	const { write } = useTicketWrite(ticket.identifier);
	const [text, setText] = useState(ticket.title);
	const [conflict, setConflict] = useState<Conflict | null>(null);
	const field = useRef<HTMLTextAreaElement>(null);
	// The last text sent, so Enter followed by its blur saves once.
	const sent = useRef<string | null>(null);
	// Escape blurs the field; the blur that follows must save nothing.
	const reverting = useRef(false);

	useEffect(() => {
		setText(ticket.title);
		sent.current = null;
	}, [ticket.title]);

	useLayoutEffect(() => {
		if (field.current !== null && text !== undefined) fitHeight(field.current);
	}, [text]);

	useEffect(() => {
		const element = field.current!;
		let width = element.getBoundingClientRect().width;
		const observer = new ResizeObserver(([entry]) => {
			if (entry!.contentRect.width === width) return;
			width = entry!.contentRect.width;
			fitHeight(element);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	// The peek opens at the start of the title, also for a title longer
	// than one line.
	useEffect(() => {
		const element = field.current;
		if (!autoFocus || element === null) return;
		element.focus();
		element.setSelectionRange(0, 0);
		element.scrollTop = 0;
		element.scrollLeft = 0;
	}, [autoFocus]);

	const save = async (title: string, expectedVersion: number | undefined) => {
		try {
			await write((client) => client.tickets.update({ ticket: ticket.identifier, title, expectedVersion }));
			setConflict(null);
		} catch (error) {
			const current = conflictCurrent(error);
			if (current !== null) {
				setConflict({ current, title });
				return;
			}
			failToast(`${ticket.identifier} did not get the new title.`, error, () => void save(title, expectedVersion));
		}
	};

	const commit = () => {
		if (reverting.current) {
			reverting.current = false;
			return;
		}
		const title = text.trim();
		if (title === "") {
			setText(ticket.title);
			return;
		}
		if (title === ticket.title || title === sent.current) return;
		sent.current = title;
		void save(title, ticket.version);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter") {
			event.preventDefault();
			commit();
			field.current?.blur();
		} else if (event.key === "Escape") {
			event.preventDefault();
			setText(ticket.title);
			reverting.current = true;
			field.current?.blur();
		}
	};

	const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
		const pasted = event.clipboardData.getData("text/plain");
		if (!/[\r\n]/.test(pasted)) return;
		event.preventDefault();
		const element = event.currentTarget;
		const next = `${text.slice(0, element.selectionStart)}${oneLine(pasted)}${text.slice(element.selectionEnd)}`;
		setText(next);
	};

	return (
		<div className={cx("flex flex-col gap-2", className)}>
			<textarea
				ref={field}
				aria-label="Title"
				data-peek-focus=""
				rows={1}
				value={text}
				onChange={(event) => setText(oneLine(event.target.value))}
				onKeyDown={onKeyDown}
				onPaste={onPaste}
				onBlur={commit}
				// One line of 24 px text is 32 px tall, so a coarse pointer gets
				// the 44 px minimum from a minimum height.
				className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-fg outline-none [field-sizing:content] focus:outline-none focus-visible:outline-none pointer-coarse:min-h-11"
			/>
			{conflict !== null && (
				<ConflictNotice
					current={conflict.current}
					onOverwrite={() => void save(conflict.title, undefined)}
					onClose={() => setConflict(null)}
				/>
			)}
		</div>
	);
}
