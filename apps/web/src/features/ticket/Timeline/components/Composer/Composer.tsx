import { Paperclip, X } from "@phosphor-icons/react";
import type { Comment, Ticket } from "@trellis/api";
import { Button, cx, IconButton, Kbd, Tooltip, useHotkey } from "@trellis/ui";
import { type ChangeEvent, type FocusEvent, type KeyboardEvent, useRef, useState } from "react";
import { readActor } from "../../../../../lib/actor";
import { useApp } from "../../../../../lib/appContext";
import { failToast } from "../../../../../lib/failToast";
import { formatBytes } from "../../../../attachments/utils/formatBytes";
import { timelineOptions } from "../../../hooks/useTimeline";
import { prependTimeline, updateTimeline } from "../../utils/timelineCache";
import { type PendingCommentAttachment, postComment } from "./postComment";

export type ComposerProps = {
	ticket: Ticket;
};

// On focus or with text or staged files, the comment box shows the file
// control. With text, it also shows Comment. The Paperclip stages files for
// the comment; Comment uploads them and posts the text with their ids in one
// call. Cmd+Enter posts; the card shows at once and takes the server's row
// when it lands. A failed post removes the card and keeps the words and files.
// Each staged file keeps its attachment id, so Retry never uploads it twice.
// Each submit keeps one deduplication key, so a lost response cannot make a
// second comment. Shift+C focuses the box.
export function Composer({ ticket }: ComposerProps) {
	const { client, orpc, queryClient } = useApp();
	const key = timelineOptions(orpc, ticket.identifier).queryKey;
	const [text, setText] = useState("");
	const [focused, setFocused] = useState(false);
	const [staged, setStaged] = useState<(PendingCommentAttachment & { key: string })[]>([]);
	const [posting, setPosting] = useState(false);
	const field = useRef<HTMLTextAreaElement>(null);
	const picker = useRef<HTMLInputElement>(null);
	const open = focused || text !== "" || staged.length > 0;

	useHotkey("shift+c", (event) => {
		event.preventDefault();
		field.current?.focus();
		field.current?.scrollIntoView({ block: "nearest" });
	});

	const post = async (body: string, dedupeKey: string, files: (PendingCommentAttachment & { key: string })[]) => {
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
		setPosting(true);
		try {
			const created = await postComment(client, ticket.identifier, body, dedupeKey, files);
			setStaged((current) => current.filter((staged) => !files.includes(staged)));
			setText("");
			updateTimeline(queryClient, key, (items) =>
				items.map((item) => (item.id === temp.id ? { kind: "comment" as const, ...created } : item)),
			);
		} catch (error) {
			updateTimeline(queryClient, key, (items) => items.filter((item) => item.id !== temp.id));
			failToast(`The comment on ${ticket.identifier} is not saved.`, error, () => void post(body, dedupeKey, files));
		}
		setPosting(false);
	};

	const submit = () => {
		const body = text.trim();
		if (body === "" || posting) return;
		void post(body, crypto.randomUUID(), staged);
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
		setStaged((current) => [
			...current,
			...[...event.target.files!].map((file) => ({ key: crypto.randomUUID(), file })),
		]);
		event.target.value = "";
	};

	const unstage = (key: string) => setStaged((current) => current.filter((staged) => staged.key !== key));

	return (
		<div>
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
					placeholder="Write a comment. Use @persona to notify an assigned agent."
					rows={1}
					value={text}
					onChange={(event) => setText(event.target.value)}
					onKeyDown={onKeyDown}
					className={cx(
						"w-full resize-none bg-transparent text-base leading-5 text-fg outline-none placeholder:text-fg-faint",
						open ? "min-h-[72px] max-h-[272px] overflow-y-auto [field-sizing:content]" : "min-h-12 overflow-hidden",
					)}
				/>
				{staged.length > 0 && (
					<ul aria-label="Files for this comment" className="flex flex-col gap-1">
						{staged.map(({ key, file }) => (
							<li key={key} className="flex h-7 items-center gap-2 text-sm">
								<Paperclip aria-hidden="true" className="size-3.5 shrink-0 text-fg-muted" />
								<span className="min-w-0 flex-1 truncate text-fg">{file.name}</span>
								<span className="shrink-0 text-fg-muted tabular">{formatBytes(file.size)}</span>
								<IconButton label={`Remove ${file.name}`} size="sm" icon={<X />} onClick={() => unstage(key)} />
							</li>
						))}
					</ul>
				)}
				{open ? (
					<div className="flex h-7 items-center gap-2">
						<input ref={picker} type="file" multiple className="hidden" onChange={picked} />
						<Tooltip content="Attach a file">
							<IconButton
								label="Attach a file"
								size="sm"
								icon={<Paperclip />}
								onClick={() => picker.current!.click()}
							/>
						</Tooltip>
						{text.trim() !== "" && (
							<Button size="sm" variant="primary" className="ml-auto" disabled={posting} onClick={submit}>
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
