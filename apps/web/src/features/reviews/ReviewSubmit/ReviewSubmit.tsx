import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReviewThread } from "@trellis/api";
import { Button, Checkbox, Dialog, EmptyState, Select, Textarea } from "@trellis/ui";
import { useEffect, useId, useState } from "react";
import { useApp } from "../../../lib/appContext";
import type { DraftFinding } from "../ReviewComposer/ReviewComposer";
export function ReviewSubmit({
	pr,
	revisionId,
	drafts,
	threads,
	onClose,
	onSubmitted,
}: {
	pr: string;
	revisionId: string | null;
	drafts: DraftFinding[];
	threads: ReviewThread[];
	onClose: () => void;
	onSubmitted: () => void;
}) {
	const { client, orpc } = useApp();
	const agents = useQuery(orpc.agentRuns.list.queryOptions({ input: {} }));
	const [verdict, setVerdict] = useState<"commented" | "changes_requested" | "approved">("commented");
	const storageKey = `trellis.review.summary:${pr}`;
	const [body, setBody] = useState(() => localStorage.getItem(storageKey) ?? "");
	useEffect(() => {
		localStorage.setItem(storageKey, body);
	}, [body, storageKey]);
	const [recipients, setRecipients] = useState<string[]>([]);
	const [selected, setSelected] = useState<string[]>([]);
	const [noNotify, setNoNotify] = useState(false);
	const [requestId] = useState(() => crypto.randomUUID());
	const notifyHint = useId();
	const submit = useMutation({
		mutationFn: () =>
			client.reviews.submit({
				pr,
				revisionId,
				requestId,
				body,
				verdict,
				recipients,
				threadIds: selected,
				drafts: drafts.map(({ id: _id, ...draft }) => draft),
			}),
		onSuccess: () => {
			localStorage.removeItem(storageKey);
			onSubmitted();
		},
	});
	return (
		<Dialog size="lg" open title="Submit local review" onOpenChange={(open) => !open && !submit.isPending && onClose()}>
			<form
				className="review-form review-submit-form"
				onSubmit={(e) => {
					e.preventDefault();
					submit.mutate();
				}}
			>
				<p>
					{drafts.length} draft {drafts.length === 1 ? "finding" : "findings"}. This review stays in Trellis.
				</p>
				<p className="review-meta">Verdict</p>
				<Select
					label="Verdict"
					value={verdict}
					onValueChange={setVerdict}
					items={[
						{ value: "commented", label: "Comment" },
						{ value: "changes_requested", label: "Changes requested" },
						{ value: "approved", label: "Approved" },
					]}
				/>
				<Textarea label="Summary" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
				{threads.some((thread) => thread.status === "open") && (
					<details className="review-disclosure">
						<summary>Include existing findings</summary>
						<div className="review-choice-list">
							{threads
								.filter((thread) => thread.status === "open")
								.map((thread) => (
									<Checkbox
										key={thread.id}
										label={`${thread.path}:${thread.startLine}–${thread.line} · ${thread.author}`}
										checked={selected.includes(thread.id)}
										onCheckedChange={(checked) =>
											setSelected(checked ? [...selected, thread.id] : selected.filter((id) => id !== thread.id))
										}
									/>
								))}
						</div>
					</details>
				)}
				<fieldset>
					<legend>Notify agents</legend>
					<p className="review-form-hint">Choose who receives this review. Stopped agents keep it in their inbox.</p>
					{agents.isPending && <p role="status">Load agent recipients…</p>}
					{agents.isError && <p role="alert">{agents.error.message}</p>}
					{agents.data?.length === 0 && <EmptyState description="No agent runs are available." />}
					<div className="review-choice-list">
						{agents.data?.map((agent) => (
							<Checkbox
								key={agent.id}
								label={`${agent.personaName} · ${agent.ticketIdentifier ?? agent.projectPath} · ${agent.state}`}
								disabled={noNotify}
								checked={recipients.includes(agent.id)}
								onCheckedChange={(checked) =>
									setRecipients(checked ? [...recipients, agent.id] : recipients.filter((id) => id !== agent.id))
								}
							/>
						))}
					</div>
					<Checkbox
						label="Submit without a notification"
						checked={noNotify}
						onCheckedChange={(checked) => {
							setNoNotify(checked);
							if (checked) setRecipients([]);
						}}
					/>
				</fieldset>
				{!noNotify && recipients.length === 0 && (
					<p className="review-meta" id={notifyHint} role="status">
						{agents.data?.length === 0
							? "Choose ‘Submit without a notification’ to continue."
							: "Select an agent or choose ‘Submit without a notification’."}
					</p>
				)}
				{submit.isError && (
					<p role="alert" className="review-error">
						{submit.error.message}
					</p>
				)}
				<div className="review-form-actions">
					<Button type="button" onClick={onClose} disabled={submit.isPending}>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						aria-describedby={!noNotify && recipients.length === 0 ? notifyHint : undefined}
						disabled={submit.isPending || (!noNotify && recipients.length === 0)}
					>
						Submit review
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
