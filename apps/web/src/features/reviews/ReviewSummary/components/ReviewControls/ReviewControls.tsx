import { GithubLogo } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReviewRevision, TrellisClient } from "@trellis/api";
import { Button, Checkbox, ChoiceGroup, Select, Sheet, Textarea } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { ReviewerSection } from "./ReviewerSection";
import { mergeAction, primaryReviewAction, type ReviewRequest } from "./reviewControl";

type Action = Parameters<TrellisClient["reviews"]["action"]>[0]["action"];
type Verdict = "comment" | "approve" | "request_changes";

const labels: Record<Action, string> = {
	merge: "Squash and merge",
	"admin-merge": "Merge with administrator privileges",
	automerge: "Enable auto-merge",
	"disable-automerge": "Disable auto-merge",
	queue: "Join the merge queue",
	dequeue: "Leave the merge queue",
	close: "Close pull request",
	ready: "Mark ready for review",
	"update-branch": "Update branch",
	"deploy-on": "Enable deploy on merge",
	"deploy-off": "Disable deploy on merge",
	"live-create": "Create Live Branch",
	"live-deploy": "Redeploy Live Branch",
	"live-delete": "Delete Live Branch",
	"live-enable": "Enable Live Branch on push",
	"live-disable": "Disable Live Branch on push",
	"live-persist": "Keep Live Branch after merge",
	"live-unpersist": "Remove Live Branch persistence",
};

export function ReviewControls({ pr, revision, onDone }: { pr: string; revision: ReviewRevision; onDone: () => void }) {
	const { client, orpc, queryClient } = useApp();
	const meta = revision.meta as {
		state?: string;
		isDraft?: boolean;
		baseRefName?: string;
		author?: { login: string };
		reviewRequests?: ReviewRequest[];
	};
	const primary = primaryReviewAction(meta);
	const [open, setOpen] = useState(false);
	const [admin, setAdmin] = useState(false);
	const [action, setAction] = useState<Action>("automerge");
	const [verdict, setVerdict] = useState<Verdict>("comment");
	const storageKey = `trellis.review.summary:${pr}`;
	const [body, setBody] = useState(() => localStorage.getItem(storageKey) ?? "");
	const [validation, setValidation] = useState("");
	const summary = useRef<HTMLTextAreaElement>(null);
	useEffect(() => localStorage.setItem(storageKey, body), [body, storageKey]);
	const extra = useQuery({
		...orpc.reviews.metadata.queryOptions({ input: { pr } }),
		enabled: open,
	});
	const submit = useMutation({
		mutationFn: () => client.reviews.submit({ pr, headSha: revision.headSha, body, verdict }),
		onSuccess: () => {
			localStorage.removeItem(storageKey);
			setOpen(false);
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.key() });
			onDone();
		},
	});
	const primaryMutation = useMutation({
		mutationFn: (next: "ready" | "merge" | "admin-merge") =>
			client.reviews.action({ pr, headSha: revision.headSha, action: next }),
		onSuccess: () => {
			setOpen(false);
			onDone();
		},
	});
	const advanced = useMutation({
		mutationFn: () => client.reviews.action({ pr, headSha: revision.headSha, action }),
		onSuccess: () => {
			setOpen(false);
			onDone();
		},
	});
	const actionItems = Object.entries(labels)
		.filter(
			([key]) =>
				!["merge", "admin-merge", "ready"].includes(key) &&
				!key.startsWith("live-") &&
				(!key.startsWith("deploy-") || extra.data?.autoDeployAvailable),
		)
		.map(([value, label]) => ({ value: value as Action, label }));
	const pending = submit.isPending || primaryMutation.isPending || advanced.isPending;
	if (primary === null) return null;
	return (
		<>
			<Button variant="primary" onClick={() => setOpen(true)}>
				Review pull request
			</Button>
			{open && (
				<Sheet
					width="var(--review-sheet-width)"
					titleClassName="font-medium text-base"
					open
					title="Review pull request"
					motion="popover"
					onOpenChange={(next) => !next && !pending && setOpen(false)}
				>
					<div className="review-control-panel">
						<ReviewerSection pr={pr} author={meta.author?.login} requests={meta.reviewRequests ?? []} onDone={onDone} />

						<form
							className="review-control-section"
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
							<div className="review-control-heading">
								<div>
									<h3>Submit a review</h3>
									<p>Approve the changes, request changes, or leave a comment.</p>
								</div>
							</div>
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
							{submit.isError && (
								<p role="alert" className="review-error">
									{submit.error.message}
								</p>
							)}
							<div className="review-control-actions">
								<Button type="submit" processing={submit.isPending}>
									Submit review
								</Button>
							</div>
						</form>

						<section className="review-control-section" aria-labelledby="merge-heading">
							<div className="review-control-heading">
								<div>
									<h3 id="merge-heading">{primary === "ready" ? "Ready for review" : "Merge"}</h3>
									<p>
										{primary === "ready"
											? "Publish this draft for review."
											: `Squash these changes into ${meta.baseRefName}.`}
									</p>
								</div>
							</div>
							{primary === "merge" && (
								<Checkbox label="Use administrator privileges" checked={admin} onCheckedChange={setAdmin} />
							)}
							{admin && <p className="review-meta">Administrator privileges bypass branch protection.</p>}
							{primaryMutation.isError && (
								<p role="alert" className="review-error">
									{primaryMutation.error.message}
								</p>
							)}
							<div className="review-control-actions">
								<Button
									variant="primary"
									processing={primaryMutation.isPending}
									onClick={() => primaryMutation.mutate(primary === "ready" ? "ready" : mergeAction(admin))}
								>
									{primary === "ready" ? "Mark ready for review" : "Squash and merge"}
								</Button>
							</div>
						</section>

						<details className="review-control-more">
							<summary className="review-control-summary">More actions</summary>
							<form
								className="review-control-more-form"
								onSubmit={(event) => {
									event.preventDefault();
									advanced.mutate();
								}}
							>
								<Select label="Action" value={action} onValueChange={setAction} items={actionItems} />
								{action === "close" && <p>Closing the pull request stops new reviews and prevents merge.</p>}
								{advanced.isError && (
									<p role="alert" className="review-error">
										{advanced.error.message}
									</p>
								)}
								<div className="review-control-actions">
									<Button
										type="submit"
										variant={action === "close" ? "danger-soft" : "default"}
										processing={advanced.isPending}
									>
										{labels[action]}
									</Button>
								</div>
							</form>
						</details>

						<footer className="review-control-footer">
							<a href={pr} target="_blank" rel="noreferrer">
								<GithubLogo aria-hidden="true" className="review-control-github-icon" />
								Open pull request on GitHub
							</a>
							<span>Reviewed head: {revision.headSha.slice(0, 12)}</span>
						</footer>
					</div>
				</Sheet>
			)}
		</>
	);
}
