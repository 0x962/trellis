import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import type {
	FlowDocumentV1,
	FlowExecutionRecord,
	FlowExecutionStartInput,
	FlowExecutionViewV1,
	FlowSubmissionV1,
} from "@trellis/api";
import { Button, FailureState, PropertyRow, Select } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { useFlowActionRequest } from "../../useFlowActionRequest";
import { FlowActionDialog } from "../FlowActionDialog";
import { startFlowId } from "./startFlowId";

type Preview = {
	flow: string;
	name: string;
	ticket: string;
	diffId: string;
	headSha: string;
	version: number;
	publication: string | null;
};

export function StartFlowDialog({
	ticket,
	diffId,
	headSha,
	onClose,
	initialFlowId = "",
	repeatReason,
	repeatOf,
	document,
	readDocumentV1,
	onStartV1,
	recoveryBlocked,
	submission,
}: {
	ticket: string;
	diffId: string;
	headSha: string;
	onClose: () => void;
	initialFlowId?: string;
	repeatReason?: string;
	repeatOf?: string;
	document?: FlowDocumentV1;
	readDocumentV1?: (flow: string) => Promise<FlowDocumentV1>;
	onStartV1?: (input: FlowExecutionStartInput) => Promise<FlowExecutionViewV1>;
	recoveryBlocked?: boolean;
	submission?: FlowSubmissionV1 | null;
}) {
	const { client, orpc } = useApp();
	const [flowId, setFlowId] = useState(initialFlowId);
	const [preview, setPreview] = useState<Preview | null>(null);
	const flows = useQuery(orpc.flows.list.queryOptions({ input: { ticket } }));
	const selectedFlowId = document?.flow.id ?? startFlowId(flows.data ?? [], flowId);
	const flow = flows.data?.find((item) => item.id === selectedFlowId);
	const selectedDocument = document?.flow.id === selectedFlowId ? document : undefined;
	const publication =
		selectedDocument?.publication.state === "published" ? selectedDocument.publication.publication : null;
	const target: Preview | null = flow
		? {
				flow: flow.id,
				name: flow.name,
				ticket,
				diffId,
				headSha,
				version: selectedDocument?.revision ?? flow.version,
				publication: publication?.publicationId ?? null,
			}
		: null;
	const changed = JSON.stringify(preview) !== JSON.stringify(target);
	const recovery = recoveryBlocked ?? !!selectedDocument;
	const unpublished =
		selectedDocument?.engine === "langflow" && (!publication || publication.revision !== selectedDocument.revision);
	const unavailable = !!selectedDocument && (!onStartV1 || !readDocumentV1);
	const admissionPending =
		!!submission &&
		(submission.state === "reserved" ||
			submission.state === "submission_unknown" ||
			submission.admission === "closed" ||
			submission.ownership === "unknown");
	const latest = useRef({ target, blocked: recovery || unpublished || unavailable || admissionPending });
	latest.current = { target, blocked: recovery || unpublished || unavailable || admissionPending };
	const start = useFlowActionRequest<FlowExecutionStartInput, FlowExecutionRecord | FlowExecutionViewV1>(
		["start", ticket, diffId, selectedFlowId, repeatOf ?? "initial"],
		async (input) => {
			const confirmed = JSON.stringify(preview);
			const diff = await client.pullRequests.refresh({ id: input.diffId! });
			if (diff.fetchError) throw new Error(diff.fetchError);
			const revision = await client.reviews.refresh({ pr: diff.url });
			if (revision.headSha !== input.headSha)
				throw new ORPCError("FLOW_VERSION_CONFLICT", { message: "The diff head changed. Refresh the preview." });
			const assertTarget = () => {
				if (latest.current.blocked || JSON.stringify(latest.current.target) !== confirmed)
					throw new ORPCError("FLOW_VERSION_CONFLICT", { message: "The target changed. Refresh the preview." });
			};
			if (selectedDocument) {
				const current = await readDocumentV1!(input.flow);
				const currentPublication =
					current.publication.state === "published" ? current.publication.publication.publicationId : null;
				if (current.revision !== input.expectedVersion || currentPublication !== preview!.publication)
					throw new ORPCError("FLOW_VERSION_CONFLICT", { message: "The saved flow changed. Refresh the preview." });
				assertTarget();
				return onStartV1!(input);
			}
			const current = await client.flows.get({ flow: input.flow });
			if (current.flow.version !== input.expectedVersion)
				throw new ORPCError("FLOW_VERSION_CONFLICT", { message: "The saved flow changed. Refresh the preview." });
			assertTarget();
			return client.flowExecutions.start(input);
		},
	);
	const blocked = recovery || unpublished || unavailable || admissionPending || !!start.request;
	const refreshPreview = async () => {
		await flows.refetch();
		setPreview(null);
		start.clearConflict();
	};
	return (
		<FlowActionDialog
			title={repeatReason ? "Run the flow again" : "Start a local flow"}
			onClose={onClose}
			actions={
				!preview || changed ? (
					<Button type="button" disabled={!target || blocked} onClick={() => setPreview(target)}>
						Review target
					</Button>
				) : (
					<Button
						type="button"
						variant="primary"
						disabled={blocked}
						onClick={() => {
							if (blocked || changed) return;
							start.submit({
								flow: preview.flow,
								ticket: preview.ticket,
								diffId: preview.diffId,
								headSha: preview.headSha,
								requestId: crypto.randomUUID(),
								expectedVersion: preview.version,
								...(repeatReason ? { allowRepeat: true, repeatReason } : {}),
							});
						}}
					>
						Start flow
					</Button>
				)
			}
		>
			<Select
				label="Flow"
				value={selectedFlowId}
				disabled={!!start.request || !!repeatReason || !!document}
				items={(flows.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
				onValueChange={(value) => {
					setFlowId(value);
					setPreview(null);
				}}
			/>
			{preview && (
				<dl className="min-w-0 break-words text-sm">
					<PropertyRow label="Flow">{preview.name}</PropertyRow>
					<PropertyRow label="Saved revision">{preview.version}</PropertyRow>
					<PropertyRow label="Publication">
						{preview.publication ? `Published revision ${preview.version}` : "Legacy saved flow"}
					</PropertyRow>
					<PropertyRow label="Ticket">{preview.ticket}</PropertyRow>
					<PropertyRow label="Diff">{preview.diffId}</PropertyRow>
					<PropertyRow label="Reviewed head">
						<span className="min-w-0 break-all">{preview.headSha}</span>
					</PropertyRow>
				</dl>
			)}
			{preview && changed && <p role="status">The target changed. Review the current target before you start.</p>}
			{repeatReason && <p>{repeatReason}</p>}
			{recovery && <p role="status">Recovery blocks new runs.</p>}
			{unpublished && <p role="status">The saved revision has no current executable publication.</p>}
			{unavailable && <p role="status">Start transport is unavailable.</p>}
			{admissionPending && <p role="status">Run admission is pending or unknown. Another request is blocked.</p>}
			{start.request?.phase === "pending" && <p role="status">Start request pending.</p>}
			{start.request?.phase === "unknown" && (
				<p role="status">Start result unknown. Keep this request until its result is known.</p>
			)}
			{start.request?.result && (
				<p role="status">Run available: {start.request.result.id}. The server can return an existing run.</p>
			)}
			{start.request?.phase === "conflict" && (
				<Button type="button" onClick={refreshPreview}>
					Refresh preview
				</Button>
			)}
			{flows.isPending && <p role="status">Load flows…</p>}
			{(flows.error || start.request?.error) && (
				<FailureState title="The flow request did not complete" detail={flows.error?.message ?? start.request?.error} />
			)}
		</FlowActionDialog>
	);
}
