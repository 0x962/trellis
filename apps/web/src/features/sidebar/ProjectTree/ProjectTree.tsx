import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import type { ReactNode } from "react";
import { useApp } from "../../../lib/appContext";
import { projectRefOfPathname } from "../../../lib/projectPath";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { TreeRow } from "../components/TreeRow";

// The guide line of an open subtree sits at the center of the parent's
// disclosure slot: the parent's row padding plus 8 px.
const guide = ["before:left-4", "before:left-9", "before:left-14", "before:left-19"] as const;

const byPosition = (a: ProjectSummary, b: ProjectSummary) => a.position - b.position;

// The project tree in the sidebar. A root row shows its key; a sub-project
// shares the root key and shows a dot. Every row shows the open count and
// links to the project's table. Expansion persists in uiStore. A row whose
// subtree holds the active project is open whatever the stored state says.
//
// The active row follows the page the outlet shows, not the URL of a
// navigation that is still loading, so the highlight and the page match.
export function ProjectTree() {
	const { orpc } = useApp();
	const { data } = useQuery(orpc.projects.list.queryOptions({ input: { archived: false } }));
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
			const own = children.get(project.id) ?? [];
			const holdsActive = activeRef?.startsWith(`${project.path}.`) ?? false;
			const open = own.length > 0 && (holdsActive || (expanded[project.id] ?? true));
			const row = (
				<TreeRow
					key={project.id}
					project={project}
					depth={depth}
					active={project.path === activeRef}
					expander={own.length === 0 ? undefined : { open, onToggle: () => uiActions.toggleProject(project.id) }}
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
