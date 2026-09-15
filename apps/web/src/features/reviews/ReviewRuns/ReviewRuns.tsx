import { ArrowClockwise, ArrowRight, ArrowSquareOut, Play } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge, Button, EmptyState, IconButton, Input, Sheet, Textarea, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { ReviewMarkdown } from "../ReviewPage/ReviewMarkdown";

type Run = {
	runId: string;
	status: string;
	startedAt?: string;
	cwd?: string;
	nodes?: { id: string; status: string; note?: string; sessionId?: string }[];
};
export function ReviewRuns({ pr }: { pr: string }) {
	const { client, orpc, queryClient } = useApp();
	const [startOpen, setStartOpen] = useState(false);
	const [cwd, setCwd] = useState("");
	const [runId, setRunId] = useState<string>();
	const [nodeId, setNodeId] = useState<string>();
	const [note, setNote] = useState("");
	const list = useQuery({
		...orpc.reviews.runs.queryOptions({ input: { pr, action: "list" } }),
	});
	const run = useQuery({
		...orpc.reviews.runs.queryOptions({ input: { pr, action: "show", runId } }),
		enabled: !!runId,
	});
	const node = useQuery({
		...orpc.reviews.runs.queryOptions({ input: { pr, action: "node", runId, nodeId } }),
		enabled: !!nodeId,
	});
	const action = useMutation({
		mutationFn: (args: { action: "start" | "resume" | "retry" | "answer"; approve?: boolean }) =>
			client.reviews.runs({
				pr,
				runId: args.action === "start" ? undefined : runId,
				nodeId: args.action === "start" ? undefined : nodeId,
				cwd,
				note,
				...args,
			}),
		onSuccess: (value) => {
			if (value.runId) setRunId(String(value.runId));
			setStartOpen(false);
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.runs.key() });
		},
	});
	const rows = list.data?.runs as Run[] | undefined;
	const current = run.data as Run | undefined;
	const selected = current?.nodes?.find((n) => n.id === nodeId);
	return (
		<div className="review-scroll">
			<div className="review-list">
				<div className="review-header">
					<h2>Agent reviews</h2>
					<Tooltip content="Refresh review results">
						<IconButton
							label="Refresh review results"
							icon={<ArrowClockwise />}
							onClick={() => void queryClient.invalidateQueries({ queryKey: orpc.reviews.runs.key() })}
						/>
					</Tooltip>
					<Tooltip content="Open in Dots">
						<IconButton
							label="Open in Dots"
							icon={<ArrowSquareOut />}
							role="link"
							nativeButton={false}
							render={
								<a
									href={`http://dots.localhost/runs?g=review${runId ? `&run=${encodeURIComponent(runId)}` : ""}`}
									target="_blank"
									rel="noreferrer"
								/>
							}
						/>
					</Tooltip>
					<Tooltip content="Start a review run">
						<IconButton label="Start a review run" icon={<Play />} onClick={() => setStartOpen(true)} />
					</Tooltip>
					{runId && (
						<Tooltip content="Resume run">
							<IconButton
								label="Resume run"
								icon={<ArrowRight />}
								onClick={() => action.mutate({ action: "resume" })}
								disabled={action.isPending}
							/>
						</Tooltip>
					)}
				</div>
				{(list.isError || run.isError || node.isError || action.isError) && (
					<p role="alert" className="review-error">
						{list.error?.message ?? run.error?.message ?? node.error?.message ?? action.error?.message}
					</p>
				)}
				{list.isLoading && <p role="status">Load review runs…</p>}
				{rows?.length === 0 && (
					<EmptyState title="No review runs yet" description="Start an agent review for this pull request." />
				)}
				<section className="review-section" aria-label="Review runs">
					{rows?.map((r) => (
						<button
							type="button"
							className="review-file"
							key={r.runId}
							aria-current={runId === r.runId}
							onClick={() => {
								setRunId(r.runId);
								setNodeId(undefined);
							}}
						>
							<span>
								<strong>{r.runId.slice(0, 8)}</strong>
								<span className="review-meta">{r.startedAt ? ` · ${new Date(r.startedAt).toLocaleString()}` : ""}</span>
							</span>
							<Badge>{r.status}</Badge>
						</button>
					))}
				</section>
				{current && <h2 className="review-meta">Review steps</h2>}
				{current?.nodes?.map((n) => (
					<button
						type="button"
						className="review-file"
						key={n.id}
						onClick={() => setNodeId(n.id)}
						aria-current={nodeId === n.id}
					>
						<span>
							{n.id}
							{n.note && <span className="review-meta"> · {n.note}</span>}
						</span>
						<Badge>{n.status}</Badge>
					</button>
				))}
				{nodeId && (
					<section className="review-thread">
						<div className="review-message">
							<div className="review-header">
								<h3>{nodeId}</h3>
								<Tooltip content="Retry node">
									<IconButton
										label="Retry node"
										icon={<ArrowClockwise />}
										disabled={action.isPending}
										onClick={() => action.mutate({ action: "retry" })}
									/>
								</Tooltip>
							</div>
							{selected?.sessionId && <p>Session: {selected.sessionId}</p>}
							<ReviewMarkdown body={String(node.data?.reply ?? "No reply yet.")} />
							<details className="review-disclosure">
								<summary>Prompt</summary>
								<pre className="review-output">{String(node.data?.prompt ?? "")}</pre>
							</details>
							<details className="review-disclosure">
								<summary>Input</summary>
								<pre className="review-output">{String(node.data?.input ?? "")}</pre>
							</details>
							{selected?.status === "waiting" && (
								<form className="review-form" onSubmit={(e) => e.preventDefault()}>
									<Textarea label="Decision note" value={note} onChange={(e) => setNote(e.target.value)} />
									<div className="review-form-actions">
										<Button
											disabled={action.isPending}
											onClick={() => action.mutate({ action: "answer", approve: false })}
										>
											Reject
										</Button>
										<Button
											disabled={action.isPending}
											onClick={() => action.mutate({ action: "answer", approve: true })}
										>
											Approve
										</Button>
									</div>
								</form>
							)}
						</div>
					</section>
				)}
				{startOpen && (
					<Sheet
						width="var(--review-sheet-width)"
						titleClassName="font-medium text-base"
						open
						title="Start agent review"
						onOpenChange={(open) => !open && setStartOpen(false)}
					>
						<form
							className="review-form"
							onSubmit={(e) => {
								e.preventDefault();
								action.mutate({ action: "start" });
							}}
						>
							<p>This action starts the review graph for {pr}.</p>
							<Input label="Checkout path" required value={cwd} onChange={(e) => setCwd(e.target.value)} />
							{action.isError && <p role="alert">{action.error.message}</p>}
							<div className="review-form-actions">
								<Button type="button" onClick={() => setStartOpen(false)}>
									Cancel
								</Button>
								<Button type="submit" disabled={action.isPending || !cwd.startsWith("/")}>
									Start review
								</Button>
							</div>
						</form>
					</Sheet>
				)}
			</div>
		</div>
	);
}
