import { Stop } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { Avatar, ConfirmDialog, IconButton, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { hasAssignedProcess } from "../hasAssignedProcess";
import { isAgentWorking } from "../isAgentWorking";
import { NativeTerminal } from "../NativeTerminal";
import { personaKindOf } from "../personaKindOf";

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
			toast.success(`${run.personaName} stops now`);
		},
		onError: (error) => toast.error("Could not stop the agent", { description: error.message }),
	});
	const historical = run.runtime !== "native";
	const active = hasAssignedProcess(run);
	const canStop = controls && active && run.kind !== "manager";
	const workspaceUrl = historical ? null : run.url;

	return (
		<div className="flex min-w-0 flex-col gap-6">
			{heading && (
				<header className="project-settings-heading">
					<div className="flex min-w-0 items-center gap-3">
						<Avatar
							kind="agent"
							name={run.personaName}
							personaKind={personaKindOf(run.kind)}
							state={isAgentWorking(run) ? "working" : "static"}
						/>
						<div className="min-w-0">
							<h2 className="truncate text-xl font-semibold text-fg">{run.personaName}</h2>
							<p className="mt-1 truncate text-sm text-fg-muted">{run.ticketIdentifier ?? run.projectPath}</p>
						</div>
					</div>
				</header>
			)}
			<NativeTerminal key={run.terminalId} run={run} />
			{(canStop || workspaceUrl) && (
				<div className="flex flex-wrap items-center gap-2">
					{canStop && (
						<Tooltip content="Stop agent">
							<IconButton
								label="Stop agent"
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
				open={confirmStop && active}
				title={`Stop ${run.personaName}?`}
				description="The workspace and its files stay available."
				confirmLabel="Stop agent"
				danger
				processing={stop.isPending}
				onConfirm={() => stop.mutate()}
				onCancel={() => setConfirmStop(false)}
			/>
		</div>
	);
}
