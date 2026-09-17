import { Stop } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { Avatar, ConfirmDialog, IconButton, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { agentKindOf } from "../agentKindOf";
import { agentProfileOf } from "../agentProfileOf";
import { hasAssignedProcess } from "../hasAssignedProcess";
import { isAgentWorking } from "../isAgentWorking";
import { NativeTerminal } from "../NativeTerminal";

export type AgentRunDetailsProps = {
	run: AgentRun;
	heading?: boolean;
	controls?: boolean;
};

export function AgentRunDetails({ run: initial, heading = false, controls = true }: AgentRunDetailsProps) {
	const { client, orpc, queryClient } = useApp();
	const query = useQuery({ ...orpc.agentRuns.list.queryOptions({ input: {} }), refetchInterval: 2000 });
	const run = query.data?.find((item) => item.id === initial.id) ?? initial;
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
	const canStop = controls && run.kind !== "manager" && (active || (run.kind === "agent" && run.assigned));
	const stopLabel = run.kind === "agent" ? "Remove assignment" : "Stop agent";
	const workspaceUrl = historical ? null : run.url;

	return (
		<div className="flex min-w-0 flex-col gap-6">
			{heading && (
				<header className="project-settings-heading">
					<div className="flex min-w-0 items-center gap-3">
						<Avatar
							kind="agent"
							name={run.name}
							agentKind={agentKindOf(run.kind)}
							agentProfile={agentProfileOf(run.harness)}
							state={isAgentWorking(run) ? "working" : "static"}
						/>
						<div className="min-w-0">
							<h2 className="truncate text-xl font-semibold text-fg">{run.name}</h2>
							<p className="mt-1 truncate text-sm text-fg-muted">{run.ticketIdentifier ?? run.projectPath}</p>
						</div>
					</div>
				</header>
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
