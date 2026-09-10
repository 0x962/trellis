import type { Comment, Ticket } from "@trellis/api";
import { Button, Kbd, useHotkey } from "@trellis/ui";
import { type KeyboardEvent, useRef, useState } from "react";
import { readActor } from "../../../../../lib/actor";
import { useApp } from "../../../../../lib/appContext";
import { timelineOptions } from "../../../hooks/useTimeline";
import { failToast } from "../../../utils/failToast";
import { prependTimeline, updateTimeline } from "../../utils/timelineCache";

export type ComposerProps = {
	ticket: Ticket;
};

// The comment box pinned under the timeline. Cmd+Enter posts; the card
// shows at once and takes the server's row when it lands. A failed post
// removes the card and puts the words back. Shift+C focuses the box.
export function Composer({ ticket }: ComposerProps) {
	const { client, orpc, queryClient } = useApp();
	const key = timelineOptions(orpc, ticket.identifier).queryKey;
	const [text, setText] = useState("");
	const field = useRef<HTMLTextAreaElement>(null);

	useHotkey("shift+c", (event) => {
		event.preventDefault();
		field.current?.focus();
		field.current?.scrollIntoView({ block: "nearest" });
	});

	const post = async (body: string) => {
		const actor = readActor()!;
		const now = new Date().toISOString();
		const temp: Comment & { kind: "comment" } = {
			kind: "comment",
			id: `pending-${Date.now()}`,
			ticketId: ticket.id,
			body,
			actor: { name: actor.name, kind: actor.kind },
			createdAt: now,
			updatedAt: now,
		};
		prependTimeline(queryClient, key, temp);
		try {
			const created = await client.comments.create({ ticket: ticket.identifier, body });
			updateTimeline(queryClient, key, (items) =>
				items.map((item) => (item.id === temp.id ? { kind: "comment" as const, ...created } : item)),
			);
		} catch (error) {
			updateTimeline(queryClient, key, (items) => items.filter((item) => item.id !== temp.id));
			setText(body);
			failToast(`Couldn't comment on ${ticket.identifier}`, error, () => void post(body));
		}
	};

	const submit = () => {
		const body = text.trim();
		if (body === "") return;
		setText("");
		void post(body);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			submit();
		}
	};

	return (
		<div className="mt-3 flex flex-col gap-2 rounded-md border border-border bg-surface px-3 py-2 focus-within:border-border-strong">
			<textarea
				ref={field}
				aria-label="Comment"
				placeholder="Leave a comment. Markdown, paste an image to attach it."
				rows={2}
				value={text}
				onChange={(event) => setText(event.target.value)}
				onKeyDown={onKeyDown}
				className="w-full resize-none bg-transparent text-base leading-5 text-fg outline-none placeholder:text-fg-faint"
			/>
			<div className="flex items-center justify-end gap-2">
				<span className="flex items-center gap-1 text-xs text-fg-faint">
					<Kbd>⌘</Kbd>
					<Kbd>↵</Kbd>
				</span>
				<Button size="sm" variant="primary" onClick={submit} disabled={text.trim() === ""}>
					Comment
				</Button>
			</div>
		</div>
	);
}
