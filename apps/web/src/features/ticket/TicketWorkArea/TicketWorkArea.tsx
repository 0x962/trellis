import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import type { Ticket } from "@trellis/api";
import { CheckResults, EmptyState, Select, Tabs } from "@trellis/ui";
import { type ReactNode, useEffect, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AgentRunDetails } from "../../agents/AgentRunDetails";
import { PullRequests } from "../../prs";

export function TicketWorkArea({
	ticket,
	overview,
	activity,
}: {
	ticket: Ticket;
	overview: ReactNode;
	activity: ReactNode;
}) {
	const { orpc } = useApp();
	const [tab, setTab] = useState("overview");
	const [selected, setSelected] = useState<string | null>(null);
	const hash = useLocation({ select: (location) => location.hash });
	useEffect(() => {
		if (hash.startsWith("attempt-")) setSelected(hash.slice(8));
	}, [hash]);
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ticket: ticket.identifier } }),
		refetchInterval: 3000,
	});
	const prs = useQuery({
		...orpc.pullRequests.list.queryOptions({ input: { ticket: ticket.id } }),
		initialData: ticket.prs,
	});
	const run = runs.data?.find((item) => item.id === selected) ?? runs.data?.[0];
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
			) : run ? (
				<>
					<Select
						label="Execution attempt"
						value={run.id}
						items={runs.data!.map((item) => ({ value: item.id, label: `${item.name} · ${item.state}` }))}
						onValueChange={setSelected}
					/>
					<AgentRunDetails key={run.id} run={run} />
				</>
			) : (
				<EmptyState
					title="No execution attempts"
					description="Choose an agent in the ticket properties to start work."
				/>
			)}
		</section>
	);
	return (
		<section aria-label="Ticket work area" className="min-w-0">
			<Tabs
				value={tab}
				onValueChange={setTab}
				items={[
					{
						value: "overview",
						label: "Overview",
						content: (
							<div className="flex flex-col gap-8">
								{execution}
								{overview}
							</div>
						),
					},
					{ value: "changes", label: "Changes", content: <PullRequests ticket={ticket} initialPrs={ticket.prs} /> },
					{
						value: "checks",
						label: "Checks",
						content: (
							<CheckResults
								groups={(prs.data ?? []).map((pr) => ({
									id: pr.id,
									title: `${pr.owner}/${pr.repo} #${pr.number}`,
									checks: pr.checks,
									error: pr.fetchError,
								}))}
							/>
						),
					},
					{ value: "activity", label: "Activity", content: activity },
				]}
			/>
		</section>
	);
}
