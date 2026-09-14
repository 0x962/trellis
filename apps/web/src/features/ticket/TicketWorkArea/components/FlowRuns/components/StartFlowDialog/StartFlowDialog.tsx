import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Dialog, Select } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../../../lib/appContext";

export function StartFlowDialog({ ticket, onClose }: { ticket: string; onClose: () => void }) {
	const { client, orpc, queryClient } = useApp();
	const [flowId, setFlowId] = useState("");
	const [personaId, setPersonaId] = useState("");
	const [requestId, setRequestId] = useState(() => crypto.randomUUID());
	const flows = useQuery(orpc.flows.list.queryOptions({ input: {} }));
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {} }));
	const flow = flows.data?.find((flow) => flow.id === flowId);
	const start = useMutation({
		mutationFn: () =>
			client.flowExecutions.start({
				flow: flowId,
				ticket,
				defaultPersonaId: personaId,
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
					if (flow && personaId) start.mutate();
				}}
			>
				<Select
					label="Flow"
					value={flowId}
					disabled={start.isPending}
					items={(flows.data ?? []).map((flow) => ({ value: flow.id, label: flow.name }))}
					onValueChange={(value) => {
						setFlowId(value);
						setRequestId(crypto.randomUUID());
					}}
				/>
				<Select
					label="Default worker persona"
					value={personaId}
					disabled={start.isPending}
					items={(personas.data ?? [])
						.filter((persona) => persona.kind !== "manager")
						.map((persona) => ({ value: persona.id, label: persona.name }))}
					onValueChange={(value) => {
						setPersonaId(value);
						setRequestId(crypto.randomUUID());
					}}
				/>
				<p className="text-sm text-fg-muted">
					The flow uses its saved version. Each step retains its agent, result, and required decisions.
				</p>
				{(flows.isPending || personas.isPending) && <p role="status">Load flows and personas…</p>}
				{(flows.error || personas.error || start.error) && (
					<p role="alert" className="text-sm text-danger">
						{(flows.error ?? personas.error ?? start.error)!.message}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<Button type="button" variant="quiet" disabled={start.isPending} onClick={onClose}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" disabled={!flow || !personaId || start.isPending}>
						Start flow
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
