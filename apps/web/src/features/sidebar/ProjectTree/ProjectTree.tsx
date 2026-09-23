import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { activeAgentCountOf } from "../../agents/activeAgents";
import { useActiveAgentCounts } from "../../agents/useActiveAgentCounts";
import { ProjectListStatus } from "../components/ProjectListStatus";
import { ProjectPages } from "../components/ProjectPages";
import { TreeRow } from "../components/TreeRow";
import { retrySidebarProjects, sidebarProjectsQuery } from "../sidebarProjects";

const byPosition = (a: ProjectSummary, b: ProjectSummary) => a.position - b.position;

// The active row follows the page the outlet shows, not the URL of a
// navigation that is still loading, so the highlight and the page match.
// Until the project list arrives, `ProjectListStatus` takes the place of the
// rows, so the Projects heading never sits over an empty list.
export function ProjectTree() {
	const { orpc, queryClient } = useApp();
	const projects = useQuery(sidebarProjectsQuery(orpc));
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	const expandedProjects = useUiStore((state) => state.expandedProjects);
	const projectAgentCounts = useActiveAgentCounts();
	const data = projects.data;
	// `failureCount` counts the failed tries of the fetch that runs now. A
	// Retry click starts a new fetch, so the placeholder rows come back.
	if (data === undefined)
		return (
			<nav aria-label="Projects" data-project-tree="">
				<ProjectListStatus
					failed={projects.failureCount > 0}
					onRetry={() => void retrySidebarProjects(queryClient, orpc)}
				/>
			</nav>
		);

	return (
		<nav aria-label="Projects" data-project-tree="">
			<ul className="sidebar-project-tree flex flex-col gap-0.5">
				{[...data].sort(byPosition).flatMap((project) => {
					const expanded = expandedProjects[project.id] ?? true;
					return [
						<TreeRow
							key={project.id}
							project={project}
							expanded={expanded}
							onToggle={() => uiActions.toggleProject(project.id)}
						/>,
						expanded && (
							<li key={`${project.id}.pages`}>
								<ul className={cx("flex flex-col gap-0.5")}>
									<ProjectPages
										project={project}
										pathname={pathname}
										activeAgentCount={activeAgentCountOf(projectAgentCounts, project.id)}
									/>
								</ul>
							</li>
						),
					];
				})}
			</ul>
		</nav>
	);
}
