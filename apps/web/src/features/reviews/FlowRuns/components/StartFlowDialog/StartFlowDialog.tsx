import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Dialog, Select } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { startFlowId } from "./startFlowId";

export function StartFlowDialog({
	ticket,
	headSha,
	onClose,
}: {
	ticket: string;
	headSha: string | null;
	onClose: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const [flowId, setFlowId] = useState("");
	const [requestId, setRequestId] = useState(() => crypto.randomUUID());
	const flows = useQuery(orpc.flows.list.queryOptions({ input: {} }));
	const selectedFlowId = startFlowId(flows.data ?? [], flowId);
	const flow = flows.data?.find((flow) => flow.id === selectedFlowId);
	const start = useMutation({
		mutationFn: () =>
			client.flowExecutions.start({
				flow: selectedFlowId,
				ticket,
				...(headSha === null ? {} : { headSha }),
				requestId,
				expectedVersion: flow!.version,
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.flowExecutions.list.key() });
			onClose();
		},
	});
	return (
		<Dialog open title="Start a local flow" onOpenChange={(open) => !open && !start.isPending && onClose()}>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					if (flow) start.mutate();
				}}
			>
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
				<p className="text-sm text-fg-muted">
					The flow uses its saved version. Each step retains its prompt, result, and required decisions.
				</p>
				{flows.isPending && <p role="status">Load flows…</p>}
				{(flows.error || start.error) && (
					<p role="alert" className="text-sm text-danger">
						{(flows.error ?? start.error)!.message}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<Button type="button" variant="quiet" disabled={start.isPending} onClick={onClose}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" disabled={!flow || start.isPending}>
						Start flow
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
