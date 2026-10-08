import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button, Dialog, EmptyState, FailureState, PropertyRow, Select } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { startFlowId } from "./startFlowId";

export function StartFlowDialog({
	ticket,
	diffId,
	headSha,
	onClose,
}: {
	ticket: string;
	diffId: string;
	headSha: string;
	onClose: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const [flowId, setFlowId] = useState("");
	const [requestId, setRequestId] = useState(() => crypto.randomUUID());
	// The ticket keeps the flows of its project, so the dialog offers no flow
	// that `flowExecutions.start` would refuse.
	const flows = useQuery(orpc.flows.list.queryOptions({ input: { ticket } }));
	const pullRequests = useQuery(orpc.pullRequests.list.queryOptions({ input: { ticket } }));
	const pullRequest = pullRequests.data?.find((item) => item.id === diffId);
	const pullRequestLabel = pullRequest
		? `${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}`
		: "Pull request";
	const selectedFlowId = startFlowId(flows.data ?? [], flowId);
	const flow = flows.data?.find((flow) => flow.id === selectedFlowId);
	const start = useMutation({
		mutationFn: () =>
			client.flowExecutions.start({
				flow: selectedFlowId,
				ticket,
				diffId,
				headSha,
				requestId,
				expectedVersion: flow!.version,
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.flowExecutions.list.key() });
			onClose();
		},
	});
	const retryChoices = () => Promise.all([flows.refetch(), pullRequests.refetch()]);
	return (
		<Dialog open title="Start a local flow" onOpenChange={(open) => !open && !start.isPending && onClose()}>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					if (flow) start.mutate();
				}}
			>
				<div className="flex min-w-0 flex-col gap-0.5">
					<p className="text-sm font-medium text-fg">{ticket}</p>
					<p className="break-words text-sm text-fg-muted">{pullRequestLabel}</p>
				</div>
				{flows.isSuccess && flows.data.length === 0 ? (
					<EmptyState
						title="No flow is available"
						description="Create a flow before you start a run."
						action={
							<Button size="md" render={<Link to="/ai/flows" />}>
								Create a flow
							</Button>
						}
					/>
				) : (
					<Select
						label="Flow"
						value={selectedFlowId}
						disabled={start.isPending}
						items={(flows.data ?? []).map((flow) => ({ value: flow.id, label: flow.name }))}
						onValueChange={(value) => {
							setFlowId(value);
							setRequestId(crypto.randomUUID());
						}}
					/>
				)}
				<p className="text-sm text-fg-muted">
					{flow && <span className="font-medium tabular-nums">Saved version {flow.version}. </span>}
					Each step retains its prompt, result, and required decisions.
				</p>
				<details className="text-xs text-fg-muted">
					<summary className="min-h-7 content-center cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 max-md:min-h-11">
						Technical details
					</summary>
					<dl className="mt-2 min-w-0 break-all">
						<PropertyRow label="Ticket ID">{ticket}</PropertyRow>
						<PropertyRow label="Pull request ID">{diffId}</PropertyRow>
						<PropertyRow label="Reviewed head">{headSha}</PropertyRow>
						{flow && <PropertyRow label="Flow ID">{flow.id}</PropertyRow>}
					</dl>
				</details>
				{(flows.isPending || pullRequests.isPending) && <p role="status">Load flow choices…</p>}
				{start.error && <FailureState title="The flow request did not complete" detail={start.error.message} />}
				{(flows.error || pullRequests.error) && (
					<FailureState
						title="Could not load flow choices"
						detail={(flows.error ?? pullRequests.error)!.message}
						action={
							<Button
								size="md"
								processing={flows.isFetching || pullRequests.isFetching}
								onClick={() => void retryChoices()}
							>
								Try again
							</Button>
						}
					/>
				)}
				<div className="flex justify-end gap-2">
					<Button type="button" variant="quiet" disabled={start.isPending} onClick={onClose}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" processing={start.isPending} disabled={!flow || start.isPending}>
						Start flow
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
