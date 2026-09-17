import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import type { Ticket } from "@trellis/api";
import { Avatar, CheckResults, EmptyState, Tabs } from "@trellis/ui";
import { type ReactNode, useMemo } from "react";
import { useApp } from "../../../lib/appContext";
import { AgentRunDetails } from "../../agents/AgentRunDetails";
import { isAgentWorking } from "../../agents/isAgentWorking";
import { PullRequests } from "../../prs";
import { FlowRuns } from "./components/FlowRuns";
import { LocalChanges } from "./components/LocalChanges";
import { LocalChecks } from "./components/LocalChecks";
import { useAgentTabSelection } from "./hooks/useAgentTabSelection";
import { assignedAgentTabs } from "./utils/assignedAgentTabs";

export function TicketWorkArea({ ticket, activity }: { ticket: Ticket; activity: ReactNode }) {
	const { orpc } = useApp();
	const hash = useLocation({ select: (location) => location.hash });
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ticket: ticket.identifier } }),
		refetchInterval: 2000,
	});
	const agentTabs = useMemo(() => assignedAgentTabs(runs.data ?? []), [runs.data]);
	const { tab, setTab } = useAgentTabSelection({ tabs: agentTabs, hash, pending: runs.isPending });
	const prs = useQuery({
		...orpc.pullRequests.list.queryOptions({ input: { ticket: ticket.id } }),
		initialData: ticket.prs,
	});
	const run = runs.data?.[0];
	const agentTabFallback = (
		<section aria-label="Execution" className="flex flex-col gap-3">
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
		<section aria-label="Ticket work area" className="min-w-0">
			{runs.isError && agentTabs.length > 0 && (
				<p role="alert" className="mb-3 text-sm text-danger">
					{runs.error.message}
				</p>
			)}
			<Tabs
				value={tab}
				onValueChange={setTab}
				items={[
					{ value: "activity", label: "Activity", content: activity },
					...(agentTabs.length === 0
						? [{ value: "agent", label: "Agent", content: agentTabFallback }]
						: agentTabs.map((item) => {
								const working = isAgentWorking(item.run);
								return {
									value: item.value,
									label: item.label,
									accessibleStatus: working ? "Working" : undefined,
									icon: (
										<Avatar
											kind="agent"
											name={item.run.personaName}
											personaKind={item.run.kind}
											state={working ? "working" : "static"}
										/>
									),
									content: <AgentRunDetails key={item.run.id} run={item.run} />,
								};
							})),
					{
						value: "changes",
						label: "Changes",
						content: (
							<div className="flex flex-col gap-8">
								{run?.runtime === "native" && run.workspaceId && <LocalChanges key={run.terminalId} run={run} />}
								<PullRequests ticket={ticket} initialPrs={ticket.prs} />
							</div>
						),
					},
					{
						value: "checks",
						label: "Checks",
						content: (
							<div className="flex flex-col gap-8">
								{run?.runtime === "native" && run.workspaceId && <LocalChecks key={run.terminalId} run={run} />}
								<CheckResults
									groups={(prs.data ?? []).map((pr) => ({
										id: pr.id,
										title: `${pr.owner}/${pr.repo} #${pr.number}`,
										checks: pr.checks,
										error: pr.fetchError,
									}))}
								/>
							</div>
						),
					},
					{ value: "flows", label: "Flows", content: <FlowRuns ticket={ticket.identifier} /> },
				]}
			/>
		</section>
	);
}
