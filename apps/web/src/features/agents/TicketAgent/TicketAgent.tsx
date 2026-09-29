import { X } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Avatar, Button, ConfirmDialog, IconButton, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { pageSheetActions } from "../../../stores/pageSheetStore";
import { agentKindOf } from "../agentKindOf";
import { agentMarkState } from "../agentMarkState";
import { agentProfileOf } from "../agentProfileOf";
import { allAgentRunsOptions } from "../allAgentRuns";
import { agentLabel } from "./agentLabel";
import { AssignAgent } from "./components/AssignAgent";

const dateFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});

export function TicketAgent({ ticket, disabled = false }: { ticket: string; disabled?: boolean }) {
	const { client, orpc, queryClient } = useApp();
	const query = useQuery({
		...allAgentRunsOptions(orpc, client, { ticket }),
		retry: false,
		refetchInterval: 2000,
	});
	const [confirmUnassign, setConfirmUnassign] = useState(false);
	const runs = query.data ?? [];
	const assigned = runs.find((run) => run.kind === "agent" && run.assigned) ?? null;
	const agents = runs.filter((run) => run.kind === "agent");
	const unassign = useMutation({
		mutationFn: () => client.agentRuns.stop({ id: assigned!.id }),
		onSuccess: async () => {
			setConfirmUnassign(false);
			await queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
			toast.success("Agent unassigned");
		},
		onError: (error) => toast.error(error.message),
	});
	return (
		<section aria-label="Agent assignment" className="flex flex-col pt-3 pb-1">
			{query.isPending ? (
				<p role="status" className="text-sm text-fg-faint">
					Load agents…
				</p>
			) : query.isError ? (
				<p role="alert" className="text-sm text-danger">
					Could not load agents.{" "}
					<Button variant="quiet" onClick={() => void query.refetch()}>
						Retry
					</Button>
				</p>
			) : (
				<>
					{agents.map((run) => (
						<div key={run.id} className="flex min-w-0 items-center gap-2 py-1">
							<Button
								variant="quiet"
								align="start"
								aria-label={`Open ${run.name} session from ${dateFormat.format(new Date(run.createdAt))}`}
								data-agent-session={run.id}
								className="-ml-2.5 min-w-0 flex-1 justify-start"
								onClick={() => pageSheetActions.openSession(run.id)}
							>
								<Avatar
									kind="agent"
									name={run.name}
									agentKind={agentKindOf(run.kind)}
									agentProfile={agentProfileOf(run.harness)}
									state={agentMarkState(run)}
								/>
								<span className="min-w-0 truncate">{agentLabel(run)}</span>
								{!run.assigned && (
									<time dateTime={run.createdAt} className="shrink-0 text-xs font-normal text-fg-faint">
										{dateFormat.format(new Date(run.createdAt))}
									</time>
								)}
								{run.state === "failed" && <span className="text-xs text-danger">failed</span>}
							</Button>
							{run.id === assigned?.id && (
								<Tooltip content="Unassign agent">
									<IconButton
										label="Unassign agent"
										icon={<X />}
										disabled={disabled || unassign.isPending}
										onClick={() => setConfirmUnassign(true)}
									/>
								</Tooltip>
							)}
						</div>
					))}
					{assigned === null && <AssignAgent ticket={ticket} disabled={disabled} />}
				</>
			)}
			<ConfirmDialog
				open={confirmUnassign && assigned !== null}
				title="Unassign this agent?"
				description="This stops the agent. The workspace and session history stay available."
				confirmLabel="Unassign agent"
				danger
				processing={unassign.isPending}
				onConfirm={() => unassign.mutate()}
				onCancel={() => setConfirmUnassign(false)}
			/>
		</section>
	);
}
