import { useMutation } from "@tanstack/react-query";
import type { ReviewApplyResult, ReviewThread } from "@trellis/api";
import { Button, Dialog, Textarea } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";

type Props = {
	pr: string;
	headSha: string;
	threads: ReviewThread[];
	onClose: () => void;
	onApplied: (result: ReviewApplyResult) => void;
};

const location = (thread: ReviewThread) =>
	`${thread.path}:${thread.startLine === thread.line ? thread.line : `${thread.startLine}–${thread.line}`}`;

// The commit form for one suggestion or a batch. One commit on the head
// branch takes every suggestion listed.
export function ApplySuggestionsDialog({ pr, headSha, threads, onClose, onApplied }: Props) {
	const { client, orpc, queryClient } = useApp();
	const authors = [...new Set(threads.map((thread) => thread.author))];
	const [message, setMessage] = useState(
		threads.length === 1 ? `Apply suggestion from ${authors[0]}` : "Apply suggestions from code review",
	);
	const apply = useMutation({
		mutationFn: () => client.reviews.apply({ pr, headSha, threadIds: threads.map((thread) => thread.id), message }),
		onSuccess: async (result) => {
			await queryClient.invalidateQueries({ queryKey: orpc.reviews.key() });
			onApplied(result);
		},
	});
	return (
		<Dialog
			open
			title={threads.length === 1 ? "Commit suggestion" : `Commit ${threads.length} suggestions`}
			description="One commit on the head branch takes the suggested lines."
			onOpenChange={(open) => !open && !apply.isPending && onClose()}
		>
			<form
				className="review-apply-form"
				onSubmit={(event) => {
					event.preventDefault();
					apply.mutate();
				}}
			>
				<Textarea
					label="Commit message"
					rows={3}
					value={message}
					onChange={(event) => setMessage(event.target.value)}
				/>
				<ul aria-label="Suggestions in this commit">
					{threads.map((thread) => (
						<li key={thread.id}>
							{location(thread)} · {thread.author}
						</li>
					))}
				</ul>
				{apply.isError && (
					<p role="alert" className="review-error">
						{apply.error.message}
					</p>
				)}
				<div className="review-form-actions">
					<Button type="button" disabled={apply.isPending} onClick={onClose}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" processing={apply.isPending} disabled={!message.trim()}>
						Commit changes
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
