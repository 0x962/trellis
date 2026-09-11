import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../lib/appContext";
import { AgentActions } from "./components/AgentActions";
import { AgentBatches } from "./components/AgentBatches";
import { RunRow } from "./components/RunRow";

// The heading of one section of the page.
const headingClass = "px-3 pt-4 pb-1 font-medium text-fg text-sm";

const cardClass = "rounded-lg border border-border bg-surface";

// What every agent of every project does: each agent run with its error, the
// last writes of the agents that trellis itself runs, and the batches the
// dispatcher sent.
//
// Sessions reads agentRuns.list with no ticket and no project filter, the
// query the ticket rail uses, so this page and the rail name the same
// agents. An agent-runs.changed event refetches that list, and an
// agents.session or agents.batch event refetches the overview, so the page
// follows the runner live.
export function AgentsOverview() {
	const { orpc } = useApp();
	const runs = useQuery(orpc.agentRuns.list.queryOptions({ input: {} })).data;
	const overview = useQuery(orpc.agents.overview.queryOptions({})).data;
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} })).data;
	if (runs === undefined || overview === undefined || projects === undefined) return null;

	const keys = new Map(projects.map((project) => [project.id, project.key]));
	const identifiers = new Map(overview.tickets.map((ticket) => [ticket.id, ticket.identifier]));
	// agentRuns.list gives the newest run first. Each run carries its own
	// project path, so a sub-project keeps its own group.
	const paths = [...new Set(runs.map((run) => run.projectPath))];

	return (
		<div className="flex max-w-4xl flex-col gap-4 pb-8">
			<section>
				<h2 className={headingClass}>Sessions</h2>
				{paths.length === 0 ? (
					<p className="px-3 py-2 text-fg-faint text-sm">No agent sessions yet.</p>
				) : (
					<div className="flex flex-col gap-3">
						{paths.map((path) => (
							<section key={path} aria-label={`${path} sessions`} className={cardClass}>
								<ul className="flex flex-col">
									{runs
										.filter((run) => run.projectPath === path)
										.map((run) => (
											<RunRow key={run.id} run={run} />
										))}
								</ul>
							</section>
						))}
					</div>
				)}
			</section>
			<section>
				<h2 className={headingClass}>Actions</h2>
				<div className={cardClass}>
					<AgentActions actions={overview.actions} identifiers={identifiers} />
				</div>
			</section>
			<section>
				<h2 className={headingClass}>Batches</h2>
				<div className={cardClass}>
					<AgentBatches batches={overview.batches} keys={keys} />
				</div>
			</section>
		</div>
	);
}
