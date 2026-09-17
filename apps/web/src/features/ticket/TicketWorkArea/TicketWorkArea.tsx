import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import type { Ticket } from "@trellis/api";
import { cx, EmptyState, Tabs } from "@trellis/ui";
import { type ReactNode, useEffect } from "react";
import { useApp } from "../../../lib/appContext";
import { hasAssignedProcess } from "../../agents/hasAssignedProcess";
import { NativeTerminal } from "../../agents/NativeTerminal";
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
	const execution = assigned ? (
		<NativeTerminal key={assigned.id} run={assigned} layout="fill" />
	) : (
		<section aria-label="Execution" className="flex min-h-0 flex-1 flex-col px-5 py-4 max-md:px-4">
			{runs.isError ? (
				<p role="alert" className="text-sm text-danger">
					{runs.error.message}
				</p>
			) : runs.isPending ? (
				<p role="status" className="text-sm text-fg-muted">
					Load attempts…
				</p>
			) : (
				<EmptyState title="No assigned agent" description="Choose an agent in the ticket properties to start work." />
			)}
		</section>
	);
	return (
		<section aria-label="Ticket pages" className="flex min-h-0 min-w-0 flex-1 flex-col">
			<Tabs
				className={cx("ticket-tabs-layout", tab === "agent" && "ticket-tabs-layout-flush")}
				value={tab}
				onValueChange={onTabChange}
				items={[
					{ value: "activity", label: "Activity", content: activity },
					{
						value: "agent",
						label: "Agent",
						content: execution,
					},
					{
						value: "changes",
						label: "Changes",
						content: (
							<div className="page-card flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4 max-md:px-4">
								<PullRequests ticket={ticket} initialPrs={ticket.prs} onOpen={onOpenPullRequest} />
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
