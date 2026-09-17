import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import type { Ticket } from "@trellis/api";
import { EmptyState, Tabs } from "@trellis/ui";
import { type ReactNode, useEffect } from "react";
import { useApp } from "../../../lib/appContext";
import { AgentRunDetails } from "../../agents/AgentRunDetails";
import { hasAssignedProcess } from "../../agents/hasAssignedProcess";
import { PullRequests } from "../../prs";
import { FlowRuns } from "./components/FlowRuns";

export function TicketWorkArea({
	ticket,
	activity,
	tab,
	onTabChange,
	onOpenPullRequest,
}: {
	ticket: Ticket;
	activity: ReactNode;
	tab: string;
	onTabChange: (tab: string) => void;
	onOpenPullRequest: (url: string) => void;
}) {
	const { orpc } = useApp();
	const hash = useLocation({ select: (location) => location.hash });
	useEffect(() => {
		if (hash.startsWith("attempt-")) {
			onTabChange("agent");
		}
	}, [hash, onTabChange]);
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
		<section aria-label="Ticket work area" className="min-w-0">
			<Tabs
				value={tab}
				onValueChange={onTabChange}
				items={[
					{ value: "activity", label: "Activity", content: activity },
					{ value: "agent", label: "Agent", content: execution },
					{
						value: "changes",
						label: "Changes",
						content: <PullRequests ticket={ticket} initialPrs={ticket.prs} onOpen={onOpenPullRequest} />,
					},
					{ value: "flows", label: "Flows", content: <FlowRuns ticket={ticket.identifier} /> },
				]}
			/>
		</section>
	);
}
