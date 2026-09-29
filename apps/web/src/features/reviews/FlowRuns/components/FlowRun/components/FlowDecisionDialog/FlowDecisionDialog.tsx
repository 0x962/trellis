import type { FlowExecutionDecisionInput, FlowExecutionRecord, FlowExecutionViewV1 } from "@trellis/api";
import { Button, FlowDecisionContext, Textarea } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../../../lib/appContext";
import { FlowActionDialog } from "../../../StartFlowDialog/components/FlowActionDialog";
import { useFlowActionRequest } from "../../../StartFlowDialog/useFlowActionRequest";
import { decisionView } from "./decisionView";

export function FlowDecisionDialog({
	execution,
	actionKey,
	onClose,
	recoveryBlocked,
	onDecideV1,
}: {
	execution: FlowExecutionRecord | FlowExecutionViewV1;
	actionKey: string;
	onClose: () => void;
	recoveryBlocked?: boolean;
	onDecideV1?: (input: FlowExecutionDecisionInput) => Promise<FlowExecutionViewV1>;
}) {
	const { client } = useApp();
	const recovery = recoveryBlocked ?? "schemaVersion" in execution;
	const decide = useFlowActionRequest<FlowExecutionDecisionInput, FlowExecutionRecord | FlowExecutionViewV1>(
		["decision", execution.id, actionKey],
		(input) => ("schemaVersion" in execution ? onDecideV1!(input) : client.flowExecutions.decide(input)),
	);
	const [preview, setPreview] = useState(execution);
	const [previewKey] = useState(actionKey);
	const [output, setOutput] = useState(
		() => decide.request?.input.output ?? decisionView(execution, actionKey).delivery?.output ?? "",
	);
	const receipt = decide.request?.result;
	const submitted = !!decide.request && decide.request.phase !== "conflict";
	const current = receipt && receipt.revision > execution.revision ? receipt : execution;
	const view = decisionView(current, actionKey);
	const shown = decisionView(preview, previewKey);
	const changed = actionKey !== previewKey || execution.id !== preview.id || execution.revision !== preview.revision;
	const unavailable = "schemaVersion" in execution && !onDecideV1;
	const blocked = recovery || unavailable || changed || !view.waiting || !!view.delivery || !!decide.request;
	const send = (approved: boolean) => {
		if (blocked) return;
		decide.submit({ id: preview.id, key: previewKey, expectedRevision: preview.revision, output, approved });
	};
	return (
		<FlowActionDialog
			title="Decide the flow step"
			onClose={onClose}
			actions={
				<>
					<Button type="button" disabled={blocked} onClick={() => send(false)}>
						Reject step
					</Button>
					<Button type="button" variant="primary" disabled={blocked} onClick={() => send(true)}>
						Approve step
					</Button>
				</>
			}
		>
			<p className="text-sm text-fg-muted tabular-nums">
				Run {preview.id}, revision {preview.revision}
			</p>
			<FlowDecisionContext title={shown.title} instruction={shown.instruction} outputs={shown.outputs} />
			<Textarea
				label="Decision notes"
				value={output}
				onChange={(event) => setOutput(event.target.value)}
				disabled={submitted || !!view.delivery}
			/>
			{(changed || decide.request?.phase === "conflict") && !submitted && !view.delivery && (
				<>
					<p role="status">The run changed. Review the current step before you decide. Your notes remain.</p>
					<Button
						type="button"
						onClick={() => {
							setPreview(execution);
							decide.clearConflict();
						}}
					>
						Review current step
					</Button>
				</>
			)}
			{recovery && <p role="status">Recovery blocks changes to this run.</p>}
			{unavailable && <p role="status">Decision transport is unavailable.</p>}
			{view.delivery && (
				<p role="status">
					Decision {view.delivery.approved ? "approval" : "rejection"}: {view.delivery.state}.
				</p>
			)}
			{!view.delivery && submitted && (
				<p role="status">
					{decide.request?.phase === "pending"
						? "Decision request pending."
						: receipt && !("schemaVersion" in receipt)
							? "Decision recorded."
							: "Decision delivery unknown. Wait for the saved receipt before another request."}
				</p>
			)}
			{decide.request?.error && (
				<p role="alert" className="text-sm text-danger">
					{decide.request.error}
				</p>
			)}
		</FlowActionDialog>
	);
}
