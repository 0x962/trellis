import { useQuery } from "@tanstack/react-query";
import { Avatar, Button } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AgentRunSheet } from "../AgentRunSheet";
import { agentKindOf } from "../agentKindOf";
import { isAgentWorking } from "../isAgentWorking";
import { AgentAssignmentDialog } from "./components/AgentAssignmentDialog";

export function TicketAgent({ ticket, disabled = false }: { ticket: string; disabled?: boolean }) {
	const { orpc } = useApp();
	const query = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ticket }, retry: false }),
		refetchInterval: 2000,
	});
	const [openId, setOpenId] = useState<string | null>(null);
	const runs = query.data ?? [];
	const assigned = runs.find((run) => run.kind === "agent" && run.assigned) ?? null;
	const open = runs.find((run) => run.id === openId) ?? null;
	return (
		<section aria-label="Agent assignment" className="flex flex-col border-t border-border pt-3 pb-1">
			<h3 className="mb-1 text-xs font-medium text-fg-faint">Agent</h3>
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
					{assigned && (
						<Button
							variant="quiet"
							align="start"
							aria-label={assigned.name}
							className="-ml-2.5 justify-start"
							onClick={() => setOpenId(assigned.id)}
						>
							<span className="flex min-w-0 items-center gap-2">
								<Avatar
									kind="agent"
									name={assigned.name}
									agentKind={agentKindOf(assigned.kind)}
									state={isAgentWorking(assigned) ? "working-mild" : "static"}
								/>
								<span className="truncate text-fg">{assigned.name}</span>
								{assigned.state === "failed" && <span className="text-xs text-danger">failed</span>}
							</span>
						</Button>
					)}
					{!assigned && <AgentAssignmentDialog ticket={ticket} disabled={disabled} />}
				</>
			)}
			{open && <AgentRunSheet run={open} onClose={() => setOpenId(null)} />}
		</section>
	);
}
