import { Stop } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type AgentRun, hasAssignedProcess, sessionStatusLabels } from "@trellis/api";
import { Avatar, Badge, Button, ConfirmDialog, FailureState, IconButton, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { agentKindOf } from "../agentKindOf";
import { agentProfileOf } from "../agentProfileOf";
import { agentRunStatus } from "../agentRunStatus";
import { isAgentWorking } from "../isAgentWorking";
import { NativeTerminal } from "../NativeTerminal";

export type AgentRunDetailsProps = {
	run: AgentRun;
	heading?: boolean;
	controls?: boolean;
};

export function AgentRunDetails({ run: initial, heading = false, controls = true }: AgentRunDetailsProps) {
	const { client, orpc, queryClient } = useApp();
	const query = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ids: [initial.id] } }),
		refetchInterval: 2000,
	});
	const run = query.data?.items.find((item) => item.id === initial.id) ?? initial;
	const [confirmStop, setConfirmStop] = useState(false);
	const stop = useMutation({
		mutationFn: () => client.agentRuns.stop({ id: run.id }),
		onSuccess: async () => {
			setConfirmStop(false);
			await queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
			toast.success(run.kind === "agent" ? "Assignment removed" : `${run.name} stops now`);
		},
		onError: (error) => toast.error(error.message),
	});
	const historical = run.runtime !== "native";
	const active = hasAssignedProcess(run);
	const canStop = controls && (active || (run.kind === "agent" && run.assigned));
	const stopLabel = run.kind === "agent" ? "Remove assignment" : "Stop agent";
	const workspaceUrl = historical ? null : run.url;
	const status = agentRunStatus(run);
	const profile = agentProfileOf(run.harness);

	return (
		<div className="flex min-w-0 flex-col gap-6">
			{heading && (
				<header className="project-settings-heading">
					<div className="flex min-w-0 items-center gap-3">
						<Avatar
							kind="agent"
							name={run.name}
							agentKind={agentKindOf(run.kind)}
							agentProfile={profile}
							status={status === "paused" ? undefined : status}
							state={isAgentWorking(run) ? "working" : "static"}
						/>
						<div className="min-w-0">
							<h2 className="break-words text-xl font-semibold text-fg">{run.name}</h2>
							<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
								<span>{run.ticketIdentifier ?? run.projectKey}</span>
								<Badge tone={status === "failed" ? "bad" : status === "needs-input" ? "wait" : "neutral"}>
									{status === "paused" ? "Paused" : sessionStatusLabels[status]}
								</Badge>
							</div>
							<p className="mt-1 break-words text-xs text-fg-muted">
								{[profile.model, profile.effort].filter(Boolean).join(" · ")}
							</p>
						</div>
					</div>
				</header>
			)}
			{query.isError && (
				<FailureState
					title="The agent did not refresh"
					description="The last loaded agent details stay available."
					detail={query.error.message}
					recovery="retrying"
					variant="section"
					action={
						<Button size="md" disabled={query.isFetching} onClick={() => void query.refetch()}>
							Retry
						</Button>
					}
				/>
			)}
			<NativeTerminal key={run.terminalId} run={run} />
			{(canStop || workspaceUrl) && (
				<div className="flex flex-wrap items-center gap-2">
					{canStop && (
						<Tooltip content={stopLabel}>
							<IconButton
								label={stopLabel}
								icon={<Stop />}
								disabled={run.state === "starting" || stop.isPending}
								onClick={() => setConfirmStop(true)}
							/>
						</Tooltip>
					)}
					{workspaceUrl && (
						<a href={workspaceUrl} className="ml-auto text-sm text-accent underline">
							Open workspace
						</a>
					)}
				</div>
			)}
			<ConfirmDialog
				open={confirmStop && canStop}
				title={run.kind === "agent" ? "Remove this assignment?" : `Stop ${run.name}?`}
				description="The workspace and its files stay available."
				confirmLabel={stopLabel}
				danger
				processing={stop.isPending}
				onConfirm={() => stop.mutate()}
				onCancel={() => setConfirmStop(false)}
			/>
		</div>
	);
}
