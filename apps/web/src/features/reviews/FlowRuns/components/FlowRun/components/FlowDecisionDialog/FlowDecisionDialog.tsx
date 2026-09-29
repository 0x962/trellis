import { skipToken, useQuery } from "@tanstack/react-query";
import type { FlowExecutionDecisionInput, FlowExecutionRecord, FlowExecutionViewV1 } from "@trellis/api";
import { Button, FailureState, FlowDecisionContext, Textarea } from "@trellis/ui";
import { useMemo, useState } from "react";
import { useApp } from "../../../../../../../lib/appContext";
import { useFlowActionRequest } from "../../../../useFlowActionRequest";
import { useFlowRecovery } from "../../../../useFlowRecovery";
import { FlowActionDialog } from "../../../FlowActionDialog";
import { decisionView } from "./decisionView";

export function FlowDecisionDialog({
	execution,
	actionKey,
	onClose,
	recoveryBlocked,
}: {
	execution: FlowExecutionRecord | FlowExecutionViewV1;
	actionKey: string;
	onClose: () => void;
	recoveryBlocked?: boolean;
}) {
	const { client, queryClient } = useApp();
	const { blocked: recovery } = useFlowRecovery(recoveryBlocked);
	const decide = useFlowActionRequest<FlowExecutionDecisionInput, FlowExecutionRecord | FlowExecutionViewV1>(
		["decision", execution.id, actionKey],
		(input) =>
			"schemaVersion" in execution ? client.flowExecutionsV1.decision(input) : client.flowExecutions.decide(input),
	);
	const [preview, setPreview] = useState(execution);
	const [previewKey] = useState(actionKey);
	const draftKey = ["flow-decision-notes", execution.id, actionKey];
	const notes = useQuery({
		queryKey: draftKey,
		queryFn: skipToken,
		initialData: () => decide.request?.input.output ?? decisionView(execution, actionKey).delivery?.output ?? "",
		gcTime: Infinity,
	});
	const [output, setOutput] = useState(notes.data!);
	const receipt = decide.request?.result;
	const submitted = !!decide.request && decide.request.phase !== "conflict";
	const current = receipt && receipt.revision > execution.revision ? receipt : execution;
	const view = useMemo(() => decisionView(current, actionKey), [current, actionKey]);
	const shown = useMemo(() => decisionView(preview, previewKey), [preview, previewKey]);
	const changed = actionKey !== previewKey || execution.id !== preview.id || execution.revision !== preview.revision;
	const blocked = recovery || changed || !view.waiting || !!view.delivery || !!decide.request;
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
				onChange={(event) => {
					setOutput(event.target.value);
					queryClient.setQueryData(draftKey, event.target.value);
				}}
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
				<div role="alert">
					<FailureState title="The decision request did not complete" detail={decide.request.error} />
				</div>
			)}
		</FlowActionDialog>
	);
}
