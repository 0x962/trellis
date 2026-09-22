import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import type { ReactNode } from "react";
import { useApp } from "../../../lib/appContext";
import { uiActions, useUiStore } from "../../../stores/uiStore";
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

	const children = new Map<string | null, ProjectSummary[]>();
	for (const project of data) {
		const list = children.get(project.parentId) ?? [];
		list.push(project);
		children.set(project.parentId, list);
	}
	const level = (parentId: string | null, depth: number): ReactNode[] =>
		(children.get(parentId) ?? []).sort(byPosition).flatMap((project) => {
			const expanded = expandedProjects[project.id] ?? true;
			const row = (
				<TreeRow
					key={project.id}
					project={project}
					depth={depth}
					expanded={expanded}
					onToggle={() => uiActions.toggleProject(project.id)}
				/>
			);
			return [
				row,
				expanded && (
					<li key={`${project.id}.subtree`}>
						<ul className={cx("flex flex-col gap-0.5")}>
							<ProjectPages project={project} depth={depth + 1} pathname={pathname} />
							{level(project.id, depth + 1)}
						</ul>
					</li>
				),
			];
		});

	return (
		<nav aria-label="Projects" data-project-tree="">
			<ul className="sidebar-project-tree flex flex-col gap-0.5">{level(null, 0)}</ul>
		</nav>
	);
}
