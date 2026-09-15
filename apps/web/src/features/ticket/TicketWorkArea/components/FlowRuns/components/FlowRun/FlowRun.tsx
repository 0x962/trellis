import { Stop } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import type { FlowExecutionRecord } from "@trellis/api";
import {
	Button,
	ConfirmDialog,
	Dialog,
	FlowDecisionContext,
	FlowProgress,
	IconButton,
	Textarea,
	Tooltip,
} from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../../../lib/appContext";
import { FlowTaskTerminal } from "./components/FlowTaskTerminal";

export function FlowRun({ execution }: { execution: FlowExecutionRecord }) {
	const { client, orpc, queryClient } = useApp();
	const [decision, setDecision] = useState<string | null>(null);
	const [output, setOutput] = useState("");
	const [confirmCancel, setConfirmCancel] = useState(false);
	const [terminalTask, setTerminalTask] = useState<FlowExecutionRecord["tasks"][number] | null>(null);
	const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.flowExecutions.list.key() });
	const decide = useMutation({
		mutationFn: (approved: boolean) =>
			client.flowExecutions.decide({
				id: execution.id,
				key: decision!,
				approved,
				output,
				expectedRevision: execution.revision,
			}),
		onSuccess: async () => {
			setDecision(null);
			setOutput("");
			await refresh();
		},
	});
	const cancel = useMutation({
		mutationFn: () => client.flowExecutions.cancel({ id: execution.id, expectedRevision: execution.revision }),
		onSuccess: async () => {
			setConfirmCancel(false);
			await refresh();
		},
	});
	const active = ["running", "waiting"].includes(execution.state.status);
	const decisionStep = execution.state.steps.find((step) => step.actionKey === decision);
	const decisionNode = execution.doc.nodes.find((node) => node.id === decisionStep?.nodeId);
	const completedOutputs = execution.state.steps
		.filter((step) => step.state === "succeeded" && step.output)
		.map((step) => ({
			key: step.key,
			title: execution.doc.nodes.find((node) => node.id === step.nodeId)!.title,
			text: step.output!,
		}));
	return (
		<section aria-label={execution.doc.flow.name} className="flex min-w-0 flex-col gap-3">
			<div className="flex items-center justify-between gap-3">
				<h4 className="text-sm font-medium">
					{execution.doc.flow.name} <span className="text-fg-muted tabular-nums">v{execution.state.flowVersion}</span>
				</h4>
				{active && (
					<Tooltip content="Cancel flow">
						<IconButton label="Cancel flow" icon={<Stop />} onClick={() => setConfirmCancel(true)} />
					</Tooltip>
				)}
			</div>
			{execution.state.error && (
				<p role="alert" className="text-sm text-danger">
					{execution.state.error}
				</p>
			)}
			{execution.state.steps.some((step) => step.needsStop) && (
				<p role="status" className="text-sm text-danger">
					The host has not confirmed that every flow worker stopped.
				</p>
			)}
			<FlowProgress
				status={execution.state.status}
				steps={execution.state.steps.map((step) => ({
					key: step.actionKey,
					title: execution.doc.nodes.find((node) => node.id === step.nodeId)?.title ?? step.nodeId,
					state: step.state,
					output: step.output,
					error: step.error,
					hasTerminal: execution.tasks.some((task) => task.key === step.actionKey),
				}))}
				onDecide={setDecision}
				onOpenTerminal={(key) => setTerminalTask(execution.tasks.find((task) => task.key === key)!)}
			/>
			{terminalTask && <FlowTaskTerminal task={terminalTask} onClose={() => setTerminalTask(null)} />}
			{decision !== null && (
				<Dialog
					open
					title="Decide the flow step"
					size="lg"
					onOpenChange={(open) => !open && !decide.isPending && setDecision(null)}
				>
					<form
						className="flex flex-col gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							decide.mutate(true);
						}}
					>
						<FlowDecisionContext
							title={decisionNode!.title}
							instruction={decisionNode!.instruction}
							outputs={completedOutputs}
						/>
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
			)}
			<ConfirmDialog
				open={confirmCancel}
				title="Cancel this flow?"
				description="The host stops this flow's active workers and retains their files and output."
				confirmLabel="Cancel flow"
				danger
				processing={cancel.isPending}
				onCancel={() => !cancel.isPending && setConfirmCancel(false)}
				onConfirm={() => cancel.mutate()}
			/>
			{cancel.error && (
				<p role="alert" className="text-sm text-danger">
					{cancel.error.message}
				</p>
			)}
		</section>
	);
}
