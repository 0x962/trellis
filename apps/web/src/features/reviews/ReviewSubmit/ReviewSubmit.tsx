import { useMutation } from "@tanstack/react-query";
import { Button, ChoiceGroup, Dialog, Textarea } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
export function ReviewSubmit({
	pr,
	headSha,
	onClose,
	onSubmitted,
}: {
	pr: string;
	headSha: string;
	onClose: () => void;
	onSubmitted: () => void;
}) {
	const { client } = useApp();
	const [verdict, setVerdict] = useState<"comment" | "approve" | "request_changes">("comment");
	const storageKey = `trellis.review.summary:${pr}`;
	const [body, setBody] = useState(() => localStorage.getItem(storageKey) ?? "");
	const [validation, setValidation] = useState("");
	const summary = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		localStorage.setItem(storageKey, body);
	}, [body, storageKey]);
	const submit = useMutation({
		mutationFn: () => client.reviews.submit({ pr, headSha, body, verdict }),
		onSuccess: () => {
			localStorage.removeItem(storageKey);
			onSubmitted();
		},
	});
	return (
		<Dialog size="lg" open title="Review changes" onOpenChange={(open) => !open && !submit.isPending && onClose()}>
			<form
				className="review-form review-submit-form"
				onSubmit={(e) => {
					e.preventDefault();
					if (verdict !== "approve" && body.trim().length === 0) {
						setValidation("Enter a review summary before you submit this review.");
						summary.current?.focus();
						return;
					}
					submit.mutate();
				}}
			>
				<Textarea
					ref={summary}
					label="Review summary"
					placeholder="Leave a comment"
					rows={5}
					value={body}
					invalid={validation.length > 0}
					onChange={(event) => {
						setBody(event.target.value);
						setValidation("");
					}}
				/>
				{validation && (
					<p role="alert" className="review-error">
						{validation}
					</p>
				)}
				<ChoiceGroup
					label="Review type"
					value={verdict}
					onValueChange={setVerdict}
					options={[
						{
							value: "comment",
							label: "Comment",
							description: "Submit general feedback without explicitly approving the changes.",
						},
						{ value: "approve", label: "Approve", description: "Submit feedback and approve merging these changes." },
						{
							value: "request_changes",
							label: "Request changes",
							description: "Submit feedback that must be addressed before merging.",
						},
					]}
				/>
				{submit.isError && (
					<p role="alert" className="review-error">
						{submit.error.message}
					</p>
				)}
				<div className="review-form-actions">
					<Button type="button" onClick={onClose} disabled={submit.isPending}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" processing={submit.isPending}>
						Submit review
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
