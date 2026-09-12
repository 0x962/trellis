import type { Comment, Ticket } from "@trellis/api";
import { Button, cx, IconButton, Kbd, Tooltip, useHotkey } from "@trellis/ui";
import { Paperclip } from "lucide-react";
import { type ChangeEvent, type FocusEvent, type KeyboardEvent, useRef, useState } from "react";
import { readActor } from "../../../../../lib/actor";
import { useApp } from "../../../../../lib/appContext";
import { timelineOptions } from "../../../hooks/useTimeline";
import { failToast } from "../../../utils/failToast";
import { prependTimeline, updateTimeline } from "../../utils/timelineCache";

export type ComposerProps = {
	ticket: Ticket;
	// The peek pins the composer to the bottom of its scroll area.
	pinned?: boolean;
	// Uploads picked files to the ticket. Without it, the composer shows no
	// Paperclip.
	onAttachFiles?: (files: File[]) => void;
};

// The comment box stays above the timeline while the peek body scrolls. Its
// opaque wrapper hides the timeline below it. On focus or with text, a bottom
// bar shows the Paperclip and, with text, Comment. Cmd+Enter posts;
// the card shows at once and takes the server's row when it lands. A failed
// post removes the card and puts the words back. Shift+C focuses the box.
export function Composer({ ticket, pinned = false, onAttachFiles }: ComposerProps) {
	const { client, orpc, queryClient } = useApp();
	const key = timelineOptions(orpc, ticket.identifier).queryKey;
	const [text, setText] = useState("");
	const [focused, setFocused] = useState(false);
	const field = useRef<HTMLTextAreaElement>(null);
	const picker = useRef<HTMLInputElement>(null);
	const open = focused || text !== "";

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
			parentId: null,
			resolvedAt: null,
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
			failToast(`The comment on ${ticket.identifier} is not saved.`, error, () => void post(body));
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

	// Focus that moves to the Paperclip or Comment stays inside the box, so
	// the box stays open.
	const onBlur = (event: FocusEvent<HTMLFieldSetElement>) => {
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
	};

	const picked = (event: ChangeEvent<HTMLInputElement>) => {
		onAttachFiles!([...event.target.files!]);
		event.target.value = "";
	};

	return (
		<div className={cx(pinned && "sticky bottom-0 z-10 border-t border-border bg-surface py-3")}>
			<fieldset
				aria-label="New comment"
				onFocus={() => setFocused(true)}
				onBlur={onBlur}
				className={cx(
					"flex rounded-md border border-border bg-elevated px-3 transition-colors duration-hover ease-out",
					open ? "flex-col gap-2 rounded-lg border-border-strong py-2" : "min-h-20 items-start gap-2 py-3",
				)}
			>
				<textarea
					ref={field}
					aria-label="Comment"
					placeholder="Write a comment…"
					rows={1}
					value={text}
					onChange={(event) => setText(event.target.value)}
					onKeyDown={onKeyDown}
					className={cx(
						"w-full resize-none bg-transparent text-base leading-5 text-fg outline-none placeholder:text-fg-faint",
						open ? "min-h-[72px] max-h-[272px] overflow-y-auto [field-sizing:content]" : "min-h-12 overflow-hidden",
					)}
				/>
				{open ? (
					<div className="flex h-7 items-center gap-2">
						{onAttachFiles !== undefined && (
							<>
								<input ref={picker} type="file" multiple className="hidden" onChange={picked} />
								<Tooltip content="Attach a file">
									<IconButton
										label="Attach a file"
										size="sm"
										icon={<Paperclip />}
										onClick={() => picker.current!.click()}
									/>
								</Tooltip>
							</>
						)}
						{text.trim() !== "" && (
							<Button size="sm" variant="primary" className="ml-auto" onClick={submit}>
								Comment
							</Button>
						)}
					</div>
				) : (
					<Kbd className="mt-auto shrink-0">⌘↵</Kbd>
				)}
			</fieldset>
		</div>
	);
}
