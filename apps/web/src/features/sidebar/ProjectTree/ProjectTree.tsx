import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import type { ReactNode } from "react";
import { useApp } from "../../../lib/appContext";
import { projectRefOfPathname } from "../../../lib/projectPath";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { ProjectPages } from "../components/ProjectPages";
import { TreeRow } from "../components/TreeRow";

// Each guide aligns with the center of its parent project's icon.
const guide = ["before:left-5.5", "before:left-10.5", "before:left-15.5", "before:left-20.5"] as const;

const byPosition = (a: ProjectSummary, b: ProjectSummary) => a.position - b.position;

// A folder identifies a root project; a dot identifies a sub-project.
// Each row opens the project. Expansion persists in uiStore. A row whose
// subtree holds the active project is open whatever the stored state says.
//
// The active row follows the page the outlet shows, not the URL of a
// navigation that is still loading, so the highlight and the page match.
export function ProjectTree() {
	const { orpc } = useApp();
	const { data } = useQuery(orpc.projects.list.queryOptions({ input: {} }));
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	const expanded = useUiStore((state) => state.expandedProjects);
	const activeRef = projectRefOfPathname(pathname);
	if (data === undefined) return <nav aria-label="Projects" data-project-tree="" />;

	const children = new Map<string | null, ProjectSummary[]>();
	for (const project of data) {
		const list = children.get(project.parentId) ?? [];
		list.push(project);
		children.set(project.parentId, list);
	}

	const level = (parentId: string | null, depth: number): ReactNode[] =>
		(children.get(parentId) ?? []).sort(byPosition).flatMap((project) => {
			const holdsActive = activeRef?.startsWith(`${project.path}.`) ?? false;
			const open = holdsActive || (expanded[project.id] ?? true);
			const row = (
				<TreeRow
					key={project.id}
					project={project}
					depth={depth}
					expander={{ open, onToggle: () => uiActions.toggleProject(project.id) }}
				/>
			);
			if (!open) return [row];
			return [
				row,
				<li key={`${project.id}.subtree`}>
					<ul
						className={cx(
							"relative flex flex-col gap-0.5 before:pointer-events-none before:absolute before:inset-y-0 before:z-10 before:w-px before:bg-border",
							guide[Math.min(depth, guide.length - 1)],
						)}
					>
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
