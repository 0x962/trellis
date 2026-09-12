import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import type { ReactNode } from "react";
import { useApp } from "../../../lib/appContext";
import { ProjectPages } from "../components/ProjectPages";
import { TreeRow } from "../components/TreeRow";

const byPosition = (a: ProjectSummary, b: ProjectSummary) => a.position - b.position;

// Each row is the name of its project and opens it. Every level is drawn,
// so a sub-project is always one glance away.
//
// The active row follows the page the outlet shows, not the URL of a
// navigation that is still loading, so the highlight and the page match.
export function ProjectTree() {
	const { orpc } = useApp();
	const { data } = useQuery(orpc.projects.list.queryOptions({ input: { archived: false } }));
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	if (data === undefined) return <nav aria-label="Projects" data-project-tree="" />;

	const children = new Map<string | null, ProjectSummary[]>();
	for (const project of data) {
		const list = children.get(project.parentId) ?? [];
		list.push(project);
		children.set(project.parentId, list);
	}

	const level = (parentId: string | null, depth: number): ReactNode[] =>
		(children.get(parentId) ?? []).sort(byPosition).flatMap((project) => {
			const row = <TreeRow key={project.id} project={project} depth={depth} />;
			return [
				row,
				<li key={`${project.id}.subtree`}>
					<ul className={cx("flex flex-col gap-0.5")}>
						<ProjectPages project={project} depth={depth + 1} pathname={pathname} />
						{level(project.id, depth + 1)}
					</ul>
				</li>,
			];
		});

	return (
		<nav aria-label="Projects" data-project-tree="">
			<ul className="flex flex-col gap-0.5">{level(null, 0)}</ul>
		</nav>
	);
}
