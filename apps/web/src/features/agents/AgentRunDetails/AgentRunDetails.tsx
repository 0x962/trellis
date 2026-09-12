import { useMutation, useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { Avatar, Badge, Button, ConfirmDialog, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AgentTerminal } from "../AgentTerminal";

export type AgentRunDetailsProps = {
	// The agent as the caller last read it. The list refetches, so the row
	// here follows the runner without the caller passing it again.
	run: AgentRun;
	// True draws the name and the picture above the state. The sheet puts
	// the name in its own title bar, so it leaves this off.
	heading?: boolean;
};

// Everything one agent shows: its state, what the runner said, its terminal
// output, the follow-up box, the instruction it started with, and the
// controls that stop it, read its status again, or open its workspace.
export function AgentRunDetails({ run: initial, heading = false }: AgentRunDetailsProps) {
	const { client, orpc, queryClient } = useApp();
	const query = useQuery(orpc.agentRuns.list.queryOptions({ input: {} }));
	const run = query.data?.find((item) => item.id === initial.id) ?? initial;
	const [confirmStop, setConfirmStop] = useState(false);
	const action = useMutation({
		mutationFn: (operation: "stop" | "refresh") => client.agentRuns[operation]({ id: run.id }),
		onSuccess: async (_result, operation) => {
			setConfirmStop(false);
			await queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
			if (operation === "stop") toast.success(`${run.name} stops now`);
		},
		onError: (error) => toast.error("Could not reach the agent", { description: error.message }),
	});
	const active = run.state === "running" || run.state === "starting" || run.state === "interrupted";
	return (
		<div className="flex min-w-0 flex-col gap-6">
			{heading && (
				<div className="flex min-w-0 items-center gap-2">
					<Avatar kind="agent" name={run.name} live={active} />
					<span className="truncate font-medium text-fg">{run.name}</span>
				</div>
			)}
			<div className="flex flex-wrap items-center gap-2">
				<Badge>{run.state}</Badge>
				<span className="text-sm text-fg-muted">
					{run.personaName} · {run.kind}
				</span>
			</div>
			<p className="text-sm text-fg-muted">{run.ticketIdentifier ?? run.projectPath}</p>
			{run.error && (
				<p role="alert" className="break-words text-sm text-danger">
					{run.error}
				</p>
			)}
			<AgentTerminal run={run} />
			<section aria-label="Prompt snapshot" className="flex flex-col gap-2">
				<h2 className="text-sm font-medium">Instruction at startup</h2>
				<p className="text-xs text-fg-faint">Persona edits apply to future agents.</p>
				<p className="whitespace-pre-wrap break-words text-sm text-fg-muted">{run.instruction}</p>
			</section>
			<div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
				{(active || (run.state === "failed" && run.workspaceId)) && (
					<Button
						variant="quiet"
						disabled={run.state === "starting"}
						processing={action.isPending && action.variables === "stop"}
						onClick={() => setConfirmStop(true)}
					>
						Stop agent
					</Button>
				)}
				{(run.state === "running" || run.state === "interrupted") && (
					<Button
						variant="quiet"
						processing={action.isPending && action.variables === "refresh"}
						onClick={() => action.mutate("refresh")}
					>
						Refresh status
					</Button>
				)}
				{run.url && (
					<a
						href={run.url}
						className="ml-auto inline-flex min-h-7 items-center border border-border px-3 text-sm text-accent hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
					>
						Open workspace
					</a>
				)}
			</div>
			<ConfirmDialog
				open={confirmStop && (active || run.state === "failed")}
				title={`Stop ${run.name}?`}
				description="The workspace and its files stay available."
				confirmLabel="Stop agent"
				danger
				processing={action.isPending && action.variables === "stop"}
				onConfirm={() => action.mutate("stop")}
				onCancel={() => setConfirmStop(false)}
			/>
		</div>
	);
}
