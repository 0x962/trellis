import type { Ticket } from "@trellis/api";
import { cx } from "@trellis/ui";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
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

// The 24 px title as a single-line field. Enter and blur save it once with
// the row's version; Escape puts the stored title back; an empty field
// saves nothing. A 412 shows the conflict notice with the actor who won.
export function Title({ ticket, autoFocus = false, className }: TitleProps) {
	const { write } = useTicketWrite(ticket.identifier);
	const [text, setText] = useState(ticket.title);
	const [conflict, setConflict] = useState<Conflict | null>(null);
	const field = useRef<HTMLInputElement>(null);
	// The last text sent, so Enter followed by its blur saves once.
	const sent = useRef<string | null>(null);
	// Escape blurs the field; the blur that follows must save nothing.
	const reverting = useRef(false);

	useEffect(() => {
		setText(ticket.title);
		sent.current = null;
	}, [ticket.title]);

	useEffect(() => {
		if (autoFocus) field.current?.focus();
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
			failToast(`Couldn't rename ${ticket.identifier}`, error, () => void save(title, expectedVersion));
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

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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

	return (
		<div className={cx("flex flex-col gap-2", className)}>
			<input
				ref={field}
				aria-label="Title"
				data-peek-focus=""
				value={text}
				onChange={(event) => setText(event.target.value)}
				onKeyDown={onKeyDown}
				onBlur={commit}
				className="w-full rounded-sm border border-transparent bg-transparent text-2xl font-semibold tracking-tight text-fg outline-none transition duration-hover hover:border-border focus:border-border-strong focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
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
