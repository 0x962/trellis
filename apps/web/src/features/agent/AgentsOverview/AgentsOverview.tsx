import { useQuery } from "@tanstack/react-query";
import type { AgentSession } from "@trellis/api";
import { useApp } from "../../../lib/appContext";
import { AgentActions } from "./components/AgentActions";
import { AgentBatches } from "./components/AgentBatches";
import { SessionRow } from "./components/SessionRow";

const byCreated = (a: AgentSession, b: AgentSession) => b.createdAt.localeCompare(a.createdAt);

// The heading of one section of the page.
const headingClass = "px-3 pt-4 pb-1 font-medium text-fg text-sm";

const cardClass = "rounded-lg border border-border bg-surface";

// What every agent of every project does: each session with its error, the
// last writes of the agents, and the batches the dispatcher sent. An
// agents.session or agents.batch event refetches the overview, so the page
// follows the runner live.
export function AgentsOverview() {
	const { orpc } = useApp();
	const overview = useQuery(orpc.agents.overview.queryOptions({})).data;
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} })).data;
	if (overview === undefined || projects === undefined) return null;

	const keys = new Map(projects.map((project) => [project.id, project.key]));
	const identifiers = new Map(overview.tickets.map((ticket) => [ticket.id, ticket.identifier]));
	const projectIds = [...new Set(overview.sessions.map((session) => session.projectId))];

	return (
		<div className="flex max-w-4xl flex-col gap-4 pb-8">
			<section>
				<h2 className={headingClass}>Sessions</h2>
				{projectIds.length === 0 ? (
					<p className="px-3 py-2 text-fg-faint text-sm">No agent sessions yet.</p>
				) : (
					<div className="flex flex-col gap-3">
						{projectIds.map((projectId) => (
							<section key={projectId} aria-label={`${keys.get(projectId)} sessions`} className={cardClass}>
								<ul className="flex flex-col">
									{overview.sessions
										.filter((session) => session.projectId === projectId)
										.sort(byCreated)
										.map((session) => (
											<SessionRow key={session.id} session={session} />
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
