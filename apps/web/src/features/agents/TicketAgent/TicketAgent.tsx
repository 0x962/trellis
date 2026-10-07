import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, ConfirmDialog, FailureState, SectionHeader, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AssignAgent } from "../AssignAgent";
import { allAgentRunsOptions } from "../allAgentRuns";
import { TicketAgentRun } from "./components/TicketAgentRun";

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
	const previous = runs.filter((run) => run.kind === "agent" && !run.assigned);
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
		<section aria-label="Agent assignment" className="flex min-w-0 flex-col gap-2 pt-3 pb-1">
			{query.isPending ? (
				<p role="status" className="text-sm text-fg-muted">
					Load agents…
				</p>
			) : null}
			{query.isError && (
				<FailureState
					title={query.data === undefined ? "The agents did not load" : "The agents did not refresh"}
					description={query.data === undefined ? undefined : "The last loaded assignments stay available."}
					detail={query.error.message}
					recovery="retrying"
					variant="section"
					action={
						<Button size="md" onClick={() => void query.refetch()}>
							Retry
						</Button>
					}
				/>
			)}
			{query.data !== undefined && (
				<>
					{assigned === null ? (
						<AssignAgent ticket={ticket} disabled={disabled} />
					) : (
						<div>
							<SectionHeader title="Agent" level={3} />
							<TicketAgentRun
								run={assigned}
								disabled={disabled || unassign.isPending}
								onUnassign={() => setConfirmUnassign(true)}
							/>
						</div>
					)}
					{previous.length > 0 && (
						<div>
							<SectionHeader title="Previous agents" level={3} count={previous.length} />
							{previous.map((run) => (
								<TicketAgentRun key={run.id} run={run} disabled={disabled} />
							))}
						</div>
					)}
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
