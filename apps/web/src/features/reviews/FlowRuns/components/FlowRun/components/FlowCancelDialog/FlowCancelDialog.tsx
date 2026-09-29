import type { FlowExecutionCancelInput, FlowExecutionRecord, FlowExecutionViewV1 } from "@trellis/api";
import { Button } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../../../lib/appContext";
import { FlowActionDialog } from "../../../StartFlowDialog/components/FlowActionDialog";
import { useFlowActionRequest } from "../../../StartFlowDialog/useFlowActionRequest";

export function FlowCancelDialog({
	execution,
	onClose,
	recoveryBlocked,
	onCancelV1,
}: {
	execution: FlowExecutionRecord | FlowExecutionViewV1;
	onClose: () => void;
	recoveryBlocked?: boolean;
	onCancelV1?: (input: FlowExecutionCancelInput) => Promise<FlowExecutionViewV1>;
}) {
	const { client } = useApp();
	const recovery = recoveryBlocked ?? "schemaVersion" in execution;
	const cancel = useFlowActionRequest<FlowExecutionCancelInput, FlowExecutionRecord | FlowExecutionViewV1>(
		["cancel", execution.id],
		(input) => ("schemaVersion" in execution ? onCancelV1!(input) : client.flowExecutions.cancel(input)),
	);
	const [preview, setPreview] = useState(execution);
	const receipt = cancel.request?.result;
	const submitted = !!cancel.request && cancel.request.phase !== "conflict";
	const current = receipt && receipt.revision > execution.revision ? receipt : execution;
	const status = "schemaVersion" in current ? current.status : current.state.status;
	const stops =
		"schemaVersion" in current
			? current.stopObligations.filter((stop) => stop.state !== "confirmed")
			: current.state.steps.filter((step) => step.needsStop);
	const changed = execution.id !== preview.id || execution.revision !== preview.revision;
	const unavailable = "schemaVersion" in execution && !onCancelV1;
	const blocked =
		recovery || unavailable || changed || !!cancel.request || (status !== "running" && status !== "waiting");
	return (
		<FlowActionDialog
			title="Cancel this run?"
			onClose={onClose}
			actions={
				<Button
					type="button"
					variant="danger"
					disabled={blocked}
					onClick={() => {
						if (blocked) return;
						cancel.submit({ id: preview.id, expectedRevision: preview.revision });
					}}
				>
					Cancel run
				</Button>
			}
		>
			<p>The host stops the active workers of this run and keeps their files and output.</p>
			<p className="text-sm text-fg-muted tabular-nums">
				Run {preview.id}, revision {preview.revision}
			</p>
			{(changed || cancel.request?.phase === "conflict") && !submitted && (
				<>
					<p role="status">The run changed. Review its current revision before you cancel.</p>
					<Button
						type="button"
						onClick={() => {
							setPreview(execution);
							cancel.clearConflict();
						}}
					>
						Review current revision
					</Button>
				</>
			)}
			{recovery && <p role="status">Recovery blocks changes to this run.</p>}
			{unavailable && <p role="status">Cancellation transport is unavailable.</p>}
			{stops.length > 0 && (
				<p role="status">
					The host has not confirmed that every flow worker stopped. Unresolved stops: {stops.length}.
				</p>
			)}
			{status === "canceled" && stops.length === 0 && (
				<p role="status">Cancellation recorded. All worker stops are confirmed.</p>
			)}
			{submitted && status !== "canceled" && (
				<p role="status">
					{cancel.request?.phase === "pending"
						? "Cancellation request pending."
						: "Cancellation result unknown. Wait for the saved result."}
				</p>
			)}
			{cancel.request?.error && (
				<p role="alert" className="text-sm text-danger">
					{cancel.request.error}
				</p>
			)}
		</FlowActionDialog>
	);
}
