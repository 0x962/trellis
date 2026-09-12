import { Button, Input, Select, Sheet, Textarea } from "@trellis/ui";
import type { DiffAnchor } from "@trellis/ui/review";
import { useState } from "react";
export type DraftFinding = DiffAnchor & { id: string; body: string; revisionId: string | null };
export function ReviewComposer({
	anchor,
	revisionId,
	storageKey,
	onSave,
	onClose,
}: {
	anchor: DiffAnchor;
	revisionId: string | null;
	storageKey: string;
	onSave: (draft: DraftFinding) => void;
	onClose: () => void;
}) {
	const [path, setPath] = useState(anchor.path);
	const [startLine, setStartLine] = useState(anchor.startLine);
	const [side, setSide] = useState(anchor.side);
	const [line, setLine] = useState(anchor.line);
	const [body, setBody] = useState(() => localStorage.getItem(storageKey) ?? "");
	return (
		<Sheet open title="Add review comment" onOpenChange={(open) => !open && onClose()}>
			<form
				className="review-form"
				onSubmit={(e) => {
					e.preventDefault();
					onSave({
						...anchor,
						path,
						line,
						startLine,
						side,
						body,
						id: crypto.randomUUID(),
						revisionId,
					});
					localStorage.removeItem(storageKey);
					onClose();
				}}
			>
				<p className="review-meta">
					{side} side · lines {startLine}–{line}
				</p>
				<Input label="File path" value={path} required onChange={(e) => setPath(e.target.value)} />
				<Select
					label="Diff side"
					value={side}
					onValueChange={setSide}
					items={[
						{ value: "old", label: "Old side" },
						{ value: "new", label: "New side" },
					]}
				/>
				<Input
					label="First line"
					type="number"
					min={1}
					max={line}
					value={startLine}
					onChange={(e) => setStartLine(Number(e.target.value))}
				/>
				<Input label="Last line" type="number" min={1} value={line} onChange={(e) => setLine(Number(e.target.value))} />
				<Textarea
					label="Comment"
					rows={10}
					value={body}
					onChange={(e) => {
						setBody(e.target.value);
						localStorage.setItem(storageKey, e.target.value);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) {
							e.preventDefault();
							e.currentTarget.form?.requestSubmit();
						}
					}}
				/>
				<p role="status" className="review-meta">
					Draft saved on this browser. Add it to the review before submission.
				</p>
				<div className="review-form-actions">
					<Button type="button" onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						disabled={!body.trim() || !path.trim() || line < 1 || startLine < 1 || startLine > line}
					>
						Add to review
					</Button>
				</div>
			</form>
		</Sheet>
	);
}
