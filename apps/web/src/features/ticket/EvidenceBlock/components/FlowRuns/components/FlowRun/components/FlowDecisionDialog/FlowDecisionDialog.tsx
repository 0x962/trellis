import { useMutation } from "@tanstack/react-query";
import type { FlowExecutionRecord } from "@trellis/api";
import { Button, Dialog, FlowDecisionContext, Textarea } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../../../../../lib/appContext";

// The approve or reject form of a human step. It shows the step instruction
// and the output of every finished step, because the person decides on that.
export function FlowDecisionDialog({
	execution,
	actionKey,
	onClose,
}: {
	execution: FlowExecutionRecord;
	// The key of the waiting step.
	actionKey: string;
	onClose: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const [output, setOutput] = useState("");
	const step = execution.state.steps.find((step) => step.actionKey === actionKey)!;
	const node = execution.doc.nodes.find((node) => node.id === step.nodeId)!;
	const outputs = execution.state.steps
		.filter((step) => step.state === "succeeded" && step.output)
		.map((step) => ({
			key: step.key,
			title: execution.doc.nodes.find((node) => node.id === step.nodeId)!.title,
			text: step.output!,
		}));
	const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.flowExecutions.list.key() });
	const decide = useMutation({
		mutationFn: (approved: boolean) =>
			client.flowExecutions.decide({
				id: execution.id,
				key: actionKey,
				approved,
				output,
				expectedRevision: execution.revision,
			}),
		onSuccess: async () => {
			await refresh();
			onClose();
		},
		// A revision conflict means the run moved on. The fresh record shows where.
		onError: refresh,
	});
	return (
		<Dialog
			open
			title="Decide the flow step"
			size="lg"
			onOpenChange={(open) => !open && !decide.isPending && onClose()}
		>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					decide.mutate(true);
				}}
			>
				<FlowDecisionContext title={node.title} instruction={node.instruction} outputs={outputs} />
				<Textarea
					label="Decision notes"
					value={output}
					onChange={(event) => setOutput(event.target.value)}
					maxLength={512 * 1024}
					disabled={decide.isPending}
				/>
				{decide.error && (
					<p role="alert" className="text-sm text-danger">
						{decide.error.message}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<Button type="button" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
						Reject step
					</Button>
					<Button type="submit" variant="primary" disabled={decide.isPending}>
						Approve step
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
