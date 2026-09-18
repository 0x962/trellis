import { GitDiff } from "@phosphor-icons/react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "../../primitives/Button";
import { IconButton } from "../../primitives/IconButton";
import { Tabs } from "../../primitives/Tabs";
import { Textarea } from "../../primitives/Textarea";
import { Tooltip } from "../../primitives/Tooltip";

type Props = {
	body: string;
	onChange: (body: string) => void;
	onSave: () => void;
	onCancel: () => void;
	renderPreview: (body: string) => ReactNode;
	saveLabel?: string;
	location?: string;
	pending?: boolean;
	error?: string | null;
	// The suggestion block for the selected lines. The toolbar button and
	// Cmd+G insert it at the caret. Null keeps the button off, with
	// `suggestionUnavailable` as the reason.
	suggestionText?: string | null;
	suggestionUnavailable?: string;
};

// Inserts `text` at the caret of `body` on its own lines, and answers the
// new body and the caret position on the first line inside the block.
export const insertBlock = (body: string, text: string, start: number, end: number) => {
	const before = body.slice(0, start);
	const after = body.slice(end);
	const prefix = before.length === 0 || before.endsWith("\n") ? "" : "\n";
	const suffix = after.length === 0 || after.startsWith("\n") ? "" : "\n";
	return {
		body: `${before}${prefix}${text}${suffix}${after}`,
		caret: before.length + prefix.length + text.indexOf("\n") + 1,
	};
};

export function ReviewCommentEditor({
	body,
	onChange,
	onSave,
	onCancel,
	renderPreview,
	saveLabel = "Add to review",
	location,
	pending = false,
	error = null,
	suggestionText,
	suggestionUnavailable,
}: Props) {
	const [tab, setTab] = useState("write");
	const textarea = useRef<HTMLTextAreaElement>(null);
	const suggest = () => {
		if (!suggestionText) return;
		const node = textarea.current;
		const start = node?.selectionStart ?? body.length;
		const end = node?.selectionEnd ?? start;
		const next = insertBlock(body, suggestionText, start, end);
		onChange(next.body);
		setTab("write");
		requestAnimationFrame(() => {
			const field = textarea.current;
			if (field === null) return;
			field.focus();
			field.setSelectionRange(next.caret, next.caret);
		});
	};
	const suggestLabel = suggestionText ? "Suggest a change" : (suggestionUnavailable ?? "Suggest a change");
	return (
		<form
			className="review-thread review-comment-editor"
			aria-label="Add review comment"
			onSubmit={(event) => {
				event.preventDefault();
				if (body.trim()) onSave();
			}}
		>
			{location && <div className="review-editor-location">{location}</div>}
			<Tabs
				value={tab}
				onValueChange={setTab}
				items={[
					{
						value: "write",
						label: "Write",
						content: (
							<>
								{suggestionText !== undefined && (
									<div className="review-editor-toolbar">
										<Tooltip content={suggestionText ? "Suggest a change (⌘G)" : suggestLabel}>
											<IconButton
												label={suggestLabel}
												icon={<GitDiff />}
												size="xs"
												disabled={!suggestionText}
												onClick={suggest}
											/>
										</Tooltip>
									</div>
								)}
								<Textarea
									ref={textarea}
									label="Comment"
									hideLabel
									rows={4}
									autoFocus
									placeholder="Leave a comment…"
									value={body}
									onChange={(event) => onChange(event.target.value)}
									onKeyDown={(event) => {
										const mod = event.metaKey || event.ctrlKey;
										if (mod && event.key.toLowerCase() === "g" && suggestionText) {
											event.preventDefault();
											suggest();
											return;
										}
										if (event.key === "Enter" && mod && body.trim()) {
											event.preventDefault();
											event.currentTarget.form?.requestSubmit();
										}
									}}
								/>
							</>
						),
					},
					{
						value: "preview",
						label: "Preview",
						content: (
							<div className="review-editor-preview">
								{body.trim() ? renderPreview(body) : <p className="review-meta">Nothing to preview.</p>}
							</div>
						),
					},
				]}
			/>
			<div className="review-editor-footer">
				{error && (
					<p className="review-error" role="alert">
						{error}
					</p>
				)}
				<div className="review-form-actions">
					<Button type="button" disabled={pending} onClick={onCancel}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" processing={pending} disabled={!body.trim()}>
						{saveLabel}
					</Button>
				</div>
			</div>
		</form>
	);
}
