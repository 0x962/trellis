import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import type { Ticket } from "@trellis/api";
import { EmptyState, Tabs } from "@trellis/ui";
import { type ReactNode, useEffect, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AgentRunDetails } from "../../agents/AgentRunDetails";
import { hasAssignedProcess } from "../../agents/hasAssignedProcess";
import { PullRequests } from "../../prs";
import { FlowRuns } from "./components/FlowRuns";

export function TicketWorkArea({ ticket, activity }: { ticket: Ticket; activity: ReactNode }) {
	const { orpc } = useApp();
	const [tab, setTab] = useState("activity");
	const hash = useLocation({ select: (location) => location.hash });
	useEffect(() => {
		if (hash.startsWith("attempt-")) {
			setTab("agent");
		}
	}, [hash]);
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ticket: ticket.identifier } }),
	});
	const assigned = runs.data?.find(hasAssignedProcess);
	const execution = (
		<section aria-label="Execution" className="flex flex-col gap-3">
			{runs.isError ? (
				<p role="alert" className="text-sm text-danger">
					{runs.error.message}
				</p>
			) : runs.isPending ? (
				<p role="status" className="text-sm text-fg-muted">
					Load attempts…
				</p>
			) : assigned ? (
				<AgentRunDetails key={assigned.id} run={assigned} />
			) : (
				<EmptyState title="No assigned agent" description="Choose an agent in the ticket properties to start work." />
			)}
		</section>
	);
	return (
		<section aria-label="Ticket pages" className="flex min-h-0 min-w-0 flex-1 flex-col">
			<Tabs
				className="ticket-tabs-layout"
				value={tab}
				onValueChange={setTab}
				items={[
					{ value: "activity", label: "Activity", content: activity },
					{
						value: "agent",
						label: "Agent",
						content: (
							<div className="page-card flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4 max-md:px-4">
								{execution}
							</div>
						),
					},
					{
						value: "changes",
						label: "Changes",
						content: (
							<div className="page-card flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4 max-md:px-4">
								<PullRequests ticket={ticket} initialPrs={ticket.prs} />
							</div>
						),
					},
					{
						value: "flows",
						label: "Flows",
						content: (
							<div className="page-card min-h-0 flex-1 overflow-y-auto px-5 py-4 max-md:px-4">
								<FlowRuns ticket={ticket.identifier} />
							</div>
						),
					},
				]}
			/>
		</section>
	);
}
