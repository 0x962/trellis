import { useMutation } from "@tanstack/react-query";
import type { ReviewRevision, ReviewThread } from "@trellis/api";
import { Button, Checkbox, ChoiceGroup, Popover, Textarea } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";

type Verdict = "comment" | "approve" | "request_changes";

export function ReviewSubmit({
	pr,
	revision,
	openThreads,
	onDone,
}: {
	pr: string;
	revision: ReviewRevision;
	// The open threads on the reviewed head. Checked, they go to GitHub as
	// review comments of this submission, suggestions included.
	openThreads: ReviewThread[];
	onDone: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const [open, setOpen] = useState(false);
	const [verdict, setVerdict] = useState<Verdict>("comment");
	const [sendThreads, setSendThreads] = useState(false);
	const storageKey = `trellis.review.summary:${pr}`;
	const [body, setBody] = useState(() => localStorage.getItem(storageKey) ?? "");
	const [validation, setValidation] = useState("");
	const summary = useRef<HTMLTextAreaElement>(null);
	useEffect(() => localStorage.setItem(storageKey, body), [body, storageKey]);
	const submit = useMutation({
		mutationFn: () =>
			client.reviews.submit({
				pr,
				headSha: revision.headSha,
				body,
				verdict,
				threadIds: sendThreads ? openThreads.map((thread) => thread.id) : [],
			}),
		onSuccess: () => {
			localStorage.removeItem(storageKey);
			setOpen(false);
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.key() });
			onDone();
		},
	});

	return (
		<Popover
			trigger={<Button>Review changes</Button>}
			label="Submit a review"
			open={open}
			onOpenChange={(next) => !submit.isPending && setOpen(next)}
			initialFocus={summary}
			align="end"
			className="w-100 max-w-[calc(100vw-2rem)] p-0"
		>
			<form
				className="review-submit-form"
				onSubmit={(event) => {
					event.preventDefault();
					if (verdict !== "approve" && body.trim().length === 0) {
						setValidation("Enter a review summary before you submit this review.");
						summary.current?.focus();
						return;
					}
					submit.mutate();
				}}
			>
				<header>
					<h3>Submit a review</h3>
					<p>Approve the changes, request changes, or leave a comment.</p>
				</header>
				<div className="review-submit-body">
					<Textarea
						ref={summary}
						label="Review summary"
						placeholder="Leave a comment"
						rows={4}
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
							{ value: "comment", label: "Comment", description: "Leave feedback without an approval." },
							{ value: "approve", label: "Approve", description: "Approve these changes." },
							{
								value: "request_changes",
								label: "Request changes",
								description: "Require changes before merge.",
							},
						]}
					/>
					{openThreads.length > 0 && (
						<Checkbox
							label={`Send ${openThreads.length} open ${openThreads.length === 1 ? "thread" : "threads"} to GitHub as review comments`}
							checked={sendThreads}
							onCheckedChange={setSendThreads}
						/>
					)}
					{submit.isError && (
						<p role="alert" className="review-error">
							{submit.error.message}
						</p>
					)}
				</div>
				<footer>
					<span>Reviewed head: {revision.headSha.slice(0, 12)}</span>
					<Button type="submit" variant="primary" processing={submit.isPending}>
						Submit review
					</Button>
				</footer>
			</form>
		</Popover>
	);
}
