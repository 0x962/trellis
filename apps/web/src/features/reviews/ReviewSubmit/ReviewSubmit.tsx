import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReviewThread } from "@trellis/api";
import { Button, Select, Sheet, Textarea } from "@trellis/ui";
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
		<Sheet open title="Submit local review" onOpenChange={(open) => !open && !submit.isPending && onClose()}>
			<form
				className="review-form"
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
				<fieldset>
					<legend>Include existing findings</legend>
					{threads
						.filter((t) => t.status === "open")
						.map((t) => (
							<label className="review-file" key={t.id}>
								<input
									type="checkbox"
									checked={selected.includes(t.id)}
									onChange={(e) =>
										setSelected(e.target.checked ? [...selected, t.id] : selected.filter((id) => id !== t.id))
									}
								/>
								<span>
									{t.path}:{t.startLine}–{t.line} · {t.author}
								</span>
							</label>
						))}
				</fieldset>
				<fieldset>
					<legend>Notify agents</legend>
					<p className="review-meta">Select the exact recipients. Stopped agents keep an unread review.</p>
					{agents.isPending && <p role="status">Load agent recipients…</p>}
					{agents.isError && <p role="alert">{agents.error.message}</p>}
					{agents.data?.length === 0 && (
						<p>No agent runs are available. Select “Submit without a notification” to save this review.</p>
					)}
					{agents.data?.map((agent) => (
						<label className="review-file" key={agent.id}>
							<input
								type="checkbox"
								disabled={noNotify}
								checked={recipients.includes(agent.id)}
								onChange={(e) =>
									setRecipients(
										e.target.checked ? [...recipients, agent.id] : recipients.filter((id) => id !== agent.id),
									)
								}
							/>
							<span>
								{agent.name} · {agent.ticketIdentifier ?? agent.projectPath} · {agent.state}
							</span>
						</label>
					))}
				</fieldset>
				<label className="review-file">
					<input
						type="checkbox"
						checked={noNotify}
						onChange={(e) => {
							setNoNotify(e.target.checked);
							if (e.target.checked) setRecipients([]);
						}}
					/>{" "}
					Submit without a notification
				</label>
				{!noNotify && recipients.length === 0 && (
					<p className="review-meta" id={notifyHint} role="status">
						Select an agent or choose “Submit without a notification”.
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
		</Sheet>
	);
}
