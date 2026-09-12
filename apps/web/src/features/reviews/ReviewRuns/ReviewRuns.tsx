import { ArrowClockwise, ArrowRight, Play } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, IconButton, Input, Sheet, Textarea, Tooltip } from "@trellis/ui";
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
		refetchInterval: 5000,
	});
	const run = useQuery({
		...orpc.reviews.runs.queryOptions({ input: { pr, action: "show", runId } }),
		enabled: !!runId,
		refetchInterval: 5000,
	});
	const node = useQuery({
		...orpc.reviews.runs.queryOptions({ input: { pr, action: "node", runId, nodeId } }),
		enabled: !!nodeId,
		refetchInterval: 5000,
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
				{rows?.length === 0 && <p>No review run for this PR.</p>}
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
						{r.runId} · {r.status} · {r.startedAt}
					</button>
				))}
				{current?.nodes?.map((n) => (
					<button
						type="button"
						className="review-file"
						key={n.id}
						onClick={() => setNodeId(n.id)}
						aria-current={nodeId === n.id}
					>
						{n.id} · {n.status} {n.note}
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
							<details>
								<summary>Prompt</summary>
								<pre className="review-output">{String(node.data?.prompt ?? "")}</pre>
							</details>
							<details>
								<summary>Input</summary>
								<pre className="review-output">{String(node.data?.input ?? "")}</pre>
							</details>
							<details>
								<summary>Live output</summary>
								<pre className="review-output">{String(node.data?.stream ?? "")}</pre>
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
					<Sheet open title="Start agent review" onOpenChange={(open) => !open && setStartOpen(false)}>
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
