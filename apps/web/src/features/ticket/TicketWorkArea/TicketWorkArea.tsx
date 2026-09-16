import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import type { Ticket } from "@trellis/api";
import { Avatar, CheckResults, EmptyState, Tabs } from "@trellis/ui";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AgentRunDetails } from "../../agents/AgentRunDetails";
import { isAgentWorking } from "../../agents/isAgentWorking";
import { PullRequests } from "../../prs";
import { FlowRuns } from "./components/FlowRuns";
import { LocalChanges } from "./components/LocalChanges";
import { LocalChecks } from "./components/LocalChecks";
import { assignedAgentTabs } from "./utils/assignedAgentTabs";

export function TicketWorkArea({ ticket, activity }: { ticket: Ticket; activity: ReactNode }) {
	const { orpc } = useApp();
	const [tab, setTab] = useState("activity");
	const hash = useLocation({ select: (location) => location.hash });
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ticket: ticket.identifier } }),
		refetchInterval: 2000,
	});
	const agentTabs = useMemo(() => assignedAgentTabs(runs.data ?? []), [runs.data]);
	const hashSelection = useRef({ hash: "", matched: false });
	useEffect(() => {
		if (tab === "agent" && agentTabs.length > 0) setTab(agentTabs[0]!.value);
		else if (tab.startsWith("agent:") && !agentTabs.some((item) => item.value === tab))
			setTab(agentTabs[0]?.value ?? "agent");
	}, [agentTabs, tab]);
	useEffect(() => {
		if (!hash.startsWith("attempt-")) {
			hashSelection.current = { hash: "", matched: false };
			return;
		}
		if (runs.isPending || (hashSelection.current.hash === hash && hashSelection.current.matched)) return;
		const matching = agentTabs.find((item) => item.run.terminalId === hash);
		if (matching) {
			setTab(matching.value);
			hashSelection.current = { hash, matched: true };
			return;
		}
		if (hashSelection.current.hash === hash) return;
		setTab(agentTabs[0]?.value ?? "agent");
		hashSelection.current = { hash, matched: false };
	}, [agentTabs, hash, runs.isPending]);
	const prs = useQuery({
		...orpc.pullRequests.list.queryOptions({ input: { ticket: ticket.id } }),
		initialData: ticket.prs,
	});
	const run = runs.data?.[0];
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
						? [{ value: "agent", label: "Agent", content: execution }]
						: agentTabs.map((item) => {
								const working = isAgentWorking(item.run);
								return {
									value: item.value,
									label: item.label,
									status: working ? "Working" : undefined,
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
