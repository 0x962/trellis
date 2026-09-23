import { X } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Avatar, Button, ConfirmDialog, IconButton, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { agentKindOf } from "../agentKindOf";
import { agentMarkState } from "../agentMarkState";
import { agentProfileOf } from "../agentProfileOf";
import { modelFamily } from "../ModelPicker";
import { AgentAssignmentDialog } from "./components/AgentAssignmentDialog";

export function TicketAgent({ ticket, disabled = false }: { ticket: string; disabled?: boolean }) {
	const { client, orpc, queryClient } = useApp();
	const query = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ticket }, retry: false }),
		refetchInterval: 2000,
	});
	const [confirmUnassign, setConfirmUnassign] = useState(false);
	const runs = query.data ?? [];
	const assigned = runs.find((run) => run.kind === "agent" && run.assigned) ?? null;
	const profile = agentProfileOf(assigned?.harness);
	const label = profile ? modelFamily(profile.model) : (assigned?.name ?? "Agent");
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
		<section aria-label="Agent assignment" className="flex flex-col border-t border-border pt-3 pb-1">
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
			) : assigned ? (
				<div className="flex min-w-0 items-center gap-2 py-1">
					<h3 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-fg">
						<Avatar
							kind="agent"
							name={assigned.name}
							agentKind={agentKindOf(assigned.kind)}
							agentProfile={profile}
							state={agentMarkState(assigned)}
						/>
						<span className="truncate">{label}</span>
						{assigned.state === "failed" && <span className="text-xs text-danger">failed</span>}
					</h3>
					<Tooltip content="Unassign agent">
						<IconButton
							label="Unassign agent"
							icon={<X />}
							disabled={disabled || unassign.isPending}
							onClick={() => setConfirmUnassign(true)}
						/>
					</Tooltip>
				</div>
			) : (
				<div className="flex items-center justify-between gap-2 py-1">
					<h3 className="text-xs font-medium text-fg-faint">Agent</h3>
					<AgentAssignmentDialog ticket={ticket} disabled={disabled} />
				</div>
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
