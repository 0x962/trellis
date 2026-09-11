import { useMutation, useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { Badge, Button, ConfirmDialog, Sheet, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AgentTerminal } from "./components/AgentTerminal";
export function AgentRunSheet({ run: initial, onClose }: { run: AgentRun; onClose: () => void }) {
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
		<Sheet open title={run.name} titleClassName="text-md font-medium" onOpenChange={(open) => !open && onClose()}>
			<div className="flex min-h-full flex-col">
				<div className="flex flex-1 flex-col gap-6 p-6 max-md:p-4">
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
				</div>
				<div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-border bg-surface p-4">
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
		</Sheet>
	);
}
