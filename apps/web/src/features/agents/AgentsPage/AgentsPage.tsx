import { useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { Badge, Button, EmptyState, EntityCard } from "@trellis/ui";
import { Bot, Plus } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { personaKinds } from "../../personas/PersonasPage/kinds";
import { Topbar } from "../../shell/Topbar";
import { AgentRunSheet } from "../AgentRunSheet";
import { AgentStartSheet } from "../AgentStartSheet";
export function AgentsPage() {
	const { orpc } = useApp();
	const query = useQuery(orpc.agentRuns.list.queryOptions({ input: {}, retry: false }));
	const [start, setStart] = useState(false);
	const [selected, setSelected] = useState<AgentRun | null>(null);
	return (
		<>
			<Topbar
				actions={
					<Button variant="primary" icon={<Plus />} onClick={() => setStart(true)}>
						New manager
					</Button>
				}
			>
				<h1 className="text-md font-semibold">Agents</h1>
			</Topbar>
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6 max-md:px-4">
				<div className="flex max-w-7xl flex-col gap-8">
					<p className="text-sm text-fg-muted">
						Each agent uses a persona. Assign builders and reviewers from a ticket, or start a manager for a project.
					</p>
					{query.isPending ? (
						<p role="status" className="text-sm text-fg-muted">
							Load agents…
						</p>
					) : query.isError ? (
						<p role="alert" className="text-sm text-danger">
							Could not load agents.{" "}
							<Button variant="quiet" onClick={() => void query.refetch()}>
								Retry
							</Button>
						</p>
					) : query.data.length === 0 ? (
						<EmptyState
							icon={<Bot />}
							title="No agents yet"
							description="Assign a ticket to a new agent, or start a manager for a project."
						/>
					) : (
						personaKinds.map((kind) => {
							const members = query.data.filter((run) => run.kind === kind.value);
							return (
								<section key={kind.value} aria-label={kind.plural} className="flex flex-col gap-3">
									<header className="flex items-center gap-2">
										<h2 className="text-md font-medium">{kind.plural}</h2>
										<Badge>{members.length}</Badge>
									</header>
									{members.length === 0 ? (
										<p className="border border-dashed border-border p-4 text-sm text-fg-faint">
											No {kind.plural.toLowerCase()} yet.
										</p>
									) : (
										<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
											{members.map((run) => (
												<EntityCard
													key={run.id}
													title={run.name}
													description={`${run.personaName}\n${run.ticketIdentifier ?? run.projectPath}`}
													icon={<kind.icon />}
													footer={
														<span className={run.state === "failed" ? "text-danger" : "capitalize"}>{run.state}</span>
													}
													editLabel={`View ${run.name}`}
													onEdit={() => setSelected(run)}
												/>
											))}
										</div>
									)}
								</section>
							);
						})
					)}
				</div>
			</div>
			{start && <AgentStartSheet onClose={() => setStart(false)} />}
			{selected && <AgentRunSheet run={selected} onClose={() => setSelected(null)} />}
		</>
	);
}
