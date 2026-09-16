import { Paperclip } from "@phosphor-icons/react";
import { IconButton, Textarea, Tooltip } from "@trellis/ui";
import { type ChangeEvent, type ClipboardEvent, type KeyboardEvent, type RefObject, useRef, useState } from "react";
import { useDropTarget } from "../../attachments/hooks/useDropTarget";
import { UploadProgress } from "../../attachments/UploadProgress";
import { MentionList } from "./MentionList";
import { completeMention, type MentionCandidate, matchCandidates, mentionQuery } from "./mentionQuery";
import { useChatUploads } from "./useChatUploads";

export type ChatComposerProps = {
	project: string;
	channel: string;
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	disabled?: boolean;
	candidates: readonly MentionCandidate[];
	textareaRef: RefObject<HTMLTextAreaElement | null>;
};

// The lines a message can show before the box scrolls.
const MAX_LINES = 10;

// The message input: several lines, Enter sends and Shift+Enter breaks a
// line, `@` opens the mention list, and a dropped, pasted, or picked file
// uploads and puts its markdown line at the caret.
export function ChatComposer({
	project,
	channel,
	value,
	onChange,
	onSubmit,
	disabled = false,
	candidates,
	textareaRef,
}: ChatComposerProps) {
	const fileInput = useRef<HTMLInputElement>(null);
	const [selected, setSelected] = useState(0);
	const [caret, setCaret] = useState(0);

	const query = mentionQuery(value, caret);
	const matches = query === null ? [] : matchCandidates(candidates, query.query).slice(0, 8);
	const open = matches.length > 0;

	// The box shows one row per line of text, up to MAX_LINES, then scrolls.
	const rows = Math.min(Math.max(1, value.split("\n").length), MAX_LINES);

	const insertAtCaret = (text: string) => {
		const element = textareaRef.current;
		const at = element?.selectionStart ?? value.length;
		const before = value.slice(0, at);
		const glue = before === "" || before.endsWith("\n") || before.endsWith(" ") ? "" : "\n";
		onChange(`${before}${glue}${text}\n${value.slice(at)}`);
	};

	const uploads = useChatUploads(project, insertAtCaret);
	const drop = useDropTarget(uploads.start);

	const pick = (candidate: MentionCandidate) => {
		if (query === null) return;
		const next = completeMention(value, query.start, caret, candidate.insert);
		onChange(next.text);
		setCaret(next.caret);
		requestAnimationFrame(() => {
			const element = textareaRef.current;
			if (element === null) return;
			element.focus();
			element.setSelectionRange(next.caret, next.caret);
		});
	};

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (open) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setSelected((index) => (index + 1) % matches.length);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setSelected((index) => (index - 1 + matches.length) % matches.length);
				return;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				event.preventDefault();
				pick(matches[Math.min(selected, matches.length - 1)]!);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setCaret(-1);
				return;
			}
		}
		if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault();
			onSubmit();
		}
	};

	// The caret position drives the mention list. A key that moved the
	// selection in the list must not move the caret or reset the selection,
	// so those keys stay out of the tracking.
	const track = (event: ChangeEvent<HTMLTextAreaElement> | KeyboardEvent<HTMLTextAreaElement>) => {
		if ("key" in event && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return;
		setCaret(event.currentTarget.selectionStart);
		setSelected(0);
	};

	const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
		const files = [...event.clipboardData.files];
		if (files.length === 0) return;
		event.preventDefault();
		uploads.start(files);
	};

	return (
		<section
			aria-label={`Message #${channel}`}
			className="relative flex flex-col gap-2 border-t border-border px-3 py-2"
			onDragOver={drop.onDragOver}
			onDragLeave={drop.onDragLeave}
			onDrop={drop.onDrop}
		>
			{open && <MentionList candidates={matches} selected={selected} onPick={pick} onHover={setSelected} />}
			{uploads.uploads.map((upload) => (
				<UploadProgress key={upload.id} upload={upload} onDismiss={uploads.dismiss} />
			))}
			<div className="flex items-end gap-2">
				<div className="min-w-0 flex-1">
					<Textarea
						ref={textareaRef}
						label={`Message #${channel}`}
						hideLabel
						rows={rows}
						value={value}
						disabled={disabled}
						placeholder={
							disabled ? "The project is archived." : `Message #${channel}. Shift+Enter for a new line, @ to mention.`
						}
						autoComplete="off"
						className="max-h-60"
						style={{ resize: "none" }}
						onChange={(event) => {
							onChange(event.target.value);
							track(event);
						}}
						onKeyDown={onKeyDown}
						onKeyUp={track}
						onClick={(event) => setCaret(event.currentTarget.selectionStart)}
						onPaste={onPaste}
					/>
				</div>
				<Tooltip content="Attach a file">
					<IconButton
						label="Attach a file"
						icon={<Paperclip />}
						disabled={disabled}
						onClick={() => fileInput.current?.click()}
					/>
				</Tooltip>
				<input
					ref={fileInput}
					type="file"
					multiple
					className="sr-only"
					tabIndex={-1}
					onChange={(event) => {
						uploads.start([...(event.target.files ?? [])]);
						event.target.value = "";
					}}
				/>
			</div>
			{drop.over && (
				<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-accent bg-accent-soft text-md font-medium text-accent">
					Drop to attach
				</div>
			)}
		</section>
	);
}
