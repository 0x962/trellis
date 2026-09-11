import { useMutation, useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { Badge, Button, Sheet } from "@trellis/ui";
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
		onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() }),
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
					{action.isError && (
						<p role="alert" className="text-sm text-danger">
							{action.error.message}
						</p>
					)}
				</div>
				<div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-border bg-surface p-4">
					{confirmStop && (active || run.state === "failed") && (
						<div className="flex w-full flex-wrap items-center gap-2 border border-danger p-3">
							<p className="w-full text-sm">Stop {run.name}? The workspace and its files stay available.</p>
							<Button variant="danger" disabled={action.isPending} onClick={() => action.mutate("stop")}>
								Confirm stop
							</Button>
							<Button variant="quiet" onClick={() => setConfirmStop(false)}>
								Keep agent
							</Button>
						</div>
					)}
					{(active || (run.state === "failed" && run.workspaceId)) && (
						<Button
							variant="quiet"
							disabled={action.isPending || run.state === "starting"}
							onClick={() => setConfirmStop(true)}
						>
							Stop agent
						</Button>
					)}
					{(run.state === "running" || run.state === "interrupted") && (
						<Button variant="quiet" disabled={action.isPending} onClick={() => action.mutate("refresh")}>
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
		</Sheet>
	);
}
