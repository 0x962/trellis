import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { FlowExecutionStartInput, FlowExecutionViewV1, FlowSubmissionV1 } from "@trellis/api";
import { Button, EmptyState, FailureState, PropertyRow, Select } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { useFlowActionRequest } from "../../useFlowActionRequest";
import { useFlowRecovery } from "../../useFlowRecovery";
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
	recoveryBlocked,
	submission,
	pendingFlowIds = [],
}: {
	ticket: string;
	diffId: string;
	headSha: string;
	onClose: () => void;
	initialFlowId?: string;
	repeatReason?: string;
	repeatOf?: string;
	recoveryBlocked?: boolean;
	submission?: FlowSubmissionV1 | null;
	pendingFlowIds?: readonly string[];
}) {
	const { client, orpc } = useApp();
	const [flowId, setFlowId] = useState(initialFlowId);
	const [preview, setPreview] = useState<Preview | null>(null);
	const pullRequests = useQuery(orpc.pullRequests.list.queryOptions({ input: { ticket } }));
	const pullRequest = pullRequests.data?.find((item) => item.id === diffId);
	const pullRequestLabel = pullRequest
		? `${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}`
		: "Pull request";
	const flows = useQuery(orpc.flows.list.queryOptions({ input: { ticket } }));
	const selectedFlowId = startFlowId(flows.data ?? [], flowId);
	const flow = flows.data?.find((item) => item.id === selectedFlowId);
	const document = useQuery({
		...orpc.flowDocumentsV1.get.queryOptions({ input: { flow: selectedFlowId } }),
		enabled: selectedFlowId !== "",
	});
	const selectedDocument = document.data;
	const publication =
		selectedDocument?.publication.state === "published" ? selectedDocument.publication.publication : null;
	const target: Preview | null =
		flow && selectedDocument
			? {
					flow: flow.id,
					name: flow.name,
					ticket,
					diffId,
					headSha,
					version: selectedDocument.revision,
					publication: publication?.publicationId ?? null,
				}
			: null;
	const changed = JSON.stringify(preview) !== JSON.stringify(target);
	const { blocked: recovery } = useFlowRecovery(recoveryBlocked);
	const unpublished =
		selectedDocument?.engine === "langflow" && (!publication || publication.revision !== selectedDocument.revision);
	const unavailable = document.isPending || document.isFetching || document.isError;
	const admissionPending =
		pendingFlowIds.includes(selectedFlowId) ||
		(!!submission &&
			(submission.state === "reserved" ||
				submission.state === "submission_unknown" ||
				submission.admission === "closed" ||
				submission.ownership === "unknown"));
	const latest = useRef({ target, blocked: recovery || unpublished || unavailable || admissionPending });
	latest.current = { target, blocked: recovery || unpublished || unavailable || admissionPending };
	const start = useFlowActionRequest<FlowExecutionStartInput, FlowExecutionViewV1>(
		["start", ticket, diffId, selectedFlowId, repeatOf ?? "initial"],
		(input) => client.flowExecutionsV1.start(input),
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
			const current = await client.flowDocumentsV1.get({ flow: input.flow });
			const currentPublication =
				current.publication.state === "published" ? current.publication.publication.publicationId : null;
			if (current.revision !== input.expectedVersion || currentPublication !== preview!.publication)
				throw new ORPCError("FLOW_VERSION_CONFLICT", { message: "The saved flow changed. Refresh the preview." });
			assertTarget();
		},
	);
	const blocked = recovery || unpublished || unavailable || admissionPending || !!start.request;
	const refreshPreview = async () => {
		await Promise.all([flows.refetch(), document.refetch()]);
		setPreview(null);
		start.clearConflict();
	};
	const retryAvailable = async () => {
		await Promise.all([
			pullRequests.refetch(),
			flows.refetch(),
			selectedFlowId === "" ? Promise.resolve() : document.refetch(),
		]);
	};
	const starting = start.request?.phase === "pending";
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
						processing={starting}
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
			<div className="flex min-w-0 flex-col gap-0.5">
				<p className="text-sm font-medium text-fg">{ticket}</p>
				<p className="break-words text-sm text-fg-muted">{pullRequestLabel}</p>
			</div>
			{flows.isSuccess && flows.data.length === 0 && (
				<EmptyState
					title="No flow is available"
					description="Create a flow before you start a run."
					action={
						<Button size="md" render={<Link to="/ai/flows" />}>
							Create a flow
						</Button>
					}
				/>
			)}
			<Select
				label="Flow"
				value={selectedFlowId}
				disabled={!!start.request || !!repeatReason}
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
				</dl>
			)}
			<details className="text-xs text-fg-muted">
				<summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-accent">
					Technical details
				</summary>
				<dl className="mt-2 min-w-0 break-all">
					<PropertyRow label="Ticket ID">{ticket}</PropertyRow>
					<PropertyRow label="Pull request ID">{diffId}</PropertyRow>
					<PropertyRow label="Reviewed head">{headSha}</PropertyRow>
					{preview && <PropertyRow label="Flow ID">{preview.flow}</PropertyRow>}
				</dl>
			</details>
			{preview && changed && <p role="status">The target changed. Review the current target before you start.</p>}
			{repeatReason && <p>{repeatReason}</p>}
			{recovery && <p role="status">Recovery blocks new runs.</p>}
			{unpublished && <p role="status">The saved revision has no current executable publication.</p>}
			{unavailable && <p role="status">The saved flow is not available yet.</p>}
			{admissionPending && <p role="status">Run admission is pending or unknown. Another request is blocked.</p>}
			{start.request?.phase === "pending" && <p role="status">Start request pending.</p>}
			{start.request?.phase === "unknown" && (
				<>
					<p role="status">Start result unknown. Retry uses the same confirmed target and request.</p>
					<details className="text-xs text-fg-muted">
						<summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-accent">
							Original request details
						</summary>
						<dl className="mt-2 min-w-0 break-all">
							<PropertyRow label="Flow ID">{start.request.input.flow}</PropertyRow>
							<PropertyRow label="Revision">{start.request.input.expectedVersion}</PropertyRow>
							<PropertyRow label="Ticket ID">{start.request.input.ticket}</PropertyRow>
							<PropertyRow label="Pull request ID">{start.request.input.diffId}</PropertyRow>
							<PropertyRow label="Reviewed head">{start.request.input.headSha}</PropertyRow>
						</dl>
					</details>
					<Button type="button" processing={starting} disabled={recovery} onClick={() => !recovery && start.replay()}>
						Retry original request
					</Button>
				</>
			)}
			{start.request?.result && (
				<>
					<p role="status">The run is available. The server can return an existing run.</p>
					<details className="text-xs text-fg-muted">
						<summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-accent">
							Run details
						</summary>
						<dl className="mt-2 min-w-0 break-all">
							<PropertyRow label="Run ID">{start.request.result.id}</PropertyRow>
						</dl>
					</details>
				</>
			)}
			{start.request?.phase === "preflight-failed" && <p role="status">Preview failed. No start request was sent.</p>}
			{(start.request?.phase === "conflict" || start.request?.phase === "preflight-failed") && (
				<Button type="button" onClick={refreshPreview}>
					Refresh preview
				</Button>
			)}
			{(flows.isPending || pullRequests.isPending) && <p role="status">Load flow choices…</p>}
			{start.request?.error && <FailureState title="The flow request did not complete" detail={start.request.error} />}
			{(flows.error || pullRequests.error || document.error) && (
				<FailureState
					title="The flow request did not complete"
					detail={flows.error?.message ?? pullRequests.error?.message ?? document.error?.message}
					action={
						<Button
							size="md"
							processing={flows.isFetching || pullRequests.isFetching || document.isFetching}
							onClick={() => void retryAvailable()}
						>
							Try again
						</Button>
					}
				/>
			)}
		</FlowActionDialog>
	);
}
