import { GithubLogo } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import type { ReviewRevision } from "@trellis/api";
import { Button, Checkbox, Sheet } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { mergeAction, primaryReviewAction } from "./reviewPrimaryAction";

export function ReviewPrimaryActions({
	pr,
	revision,
	onDone,
}: {
	pr: string;
	revision: ReviewRevision;
	onDone: () => void;
}) {
	const { client } = useApp();
	const meta = revision.meta as { state: string; isDraft: boolean; baseRefName: string };
	const primary = primaryReviewAction(meta);
	const [mergeOpen, setMergeOpen] = useState(false);
	const [admin, setAdmin] = useState(false);
	const mutation = useMutation({
		mutationFn: (action: "ready" | "merge" | "admin-merge") =>
			client.reviews.action({ pr, headSha: revision.headSha, action }),
		onSuccess: () => {
			setMergeOpen(false);
			onDone();
		},
	});
	if (primary === null) return null;
	return (
		<>
			<div className="review-heading-action-area">
				<div className="review-heading-actions">
					{primary === "ready" ? (
						<Button variant="primary" processing={mutation.isPending} onClick={() => mutation.mutate("ready")}>
							Mark ready for review
						</Button>
					) : (
						<Button variant="primary" onClick={() => setMergeOpen(true)}>
							Squash and merge
						</Button>
					)}
				</div>
				{primary === "ready" && mutation.isError && (
					<p className="review-error" role="alert">
						{mutation.error.message}
					</p>
				)}
			</div>
			{mergeOpen && (
				<Sheet
					width="var(--review-sheet-width)"
					titleClassName="font-medium text-base"
					open
					title="Merge pull request"
					onOpenChange={(open) => !open && !mutation.isPending && setMergeOpen(false)}
				>
					<form
						className="review-form"
						onSubmit={(event) => {
							event.preventDefault();
							mutation.mutate(mergeAction(admin));
						}}
					>
						<p>Squash these changes and merge them into {meta.baseRefName}.</p>
						<Checkbox label="Use administrator privileges" checked={admin} onCheckedChange={setAdmin} />
						{admin && <p className="review-meta">This option bypasses branch protection.</p>}
						<a className="review-meta inline-flex items-center gap-1.5" href={pr} target="_blank" rel="noreferrer">
							<GithubLogo aria-hidden="true" className="size-3.5" />
							Open pull request on GitHub
						</a>
						<p className="review-meta">Reviewed head: {revision.headSha.slice(0, 12)}</p>
						{mutation.isError && (
							<p role="alert" className="review-error">
								{mutation.error.message}
							</p>
						)}
						<div className="review-form-actions">
							<Button type="button" disabled={mutation.isPending} onClick={() => setMergeOpen(false)}>
								Cancel
							</Button>
							<Button type="submit" variant="primary" processing={mutation.isPending}>
								Squash and merge
							</Button>
						</div>
					</form>
				</Sheet>
			)}
		</>
	);
}
