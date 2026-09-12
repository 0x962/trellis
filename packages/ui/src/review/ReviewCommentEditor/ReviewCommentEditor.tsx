import { type ReactNode, useState } from "react";
import { Button } from "../../primitives/Button";
import { Tabs } from "../../primitives/Tabs";
import { Textarea } from "../../primitives/Textarea";

type Props = {
	body: string;
	onChange: (body: string) => void;
	onSave: () => void;
	onCancel: () => void;
	renderPreview: (body: string) => ReactNode;
	saveLabel?: string;
	location?: string;
};
export function ReviewCommentEditor({
	body,
	onChange,
	onSave,
	onCancel,
	renderPreview,
	saveLabel = "Add to review",
	location,
}: Props) {
	const [tab, setTab] = useState("write");
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
							<Textarea
								label="Comment"
								hideLabel
								rows={4}
								autoFocus
								placeholder="Leave a comment…"
								value={body}
								onChange={(event) => onChange(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && body.trim()) {
										event.preventDefault();
										event.currentTarget.form?.requestSubmit();
									}
								}}
							/>
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
				<p className="review-meta">Reviews stay local in Trellis.</p>
				<div className="review-form-actions">
					<Button type="button" onClick={onCancel}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" disabled={!body.trim()}>
						{saveLabel}
					</Button>
				</div>
			</div>
		</form>
	);
}
