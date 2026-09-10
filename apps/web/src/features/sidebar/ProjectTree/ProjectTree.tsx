import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx, IconButton } from "@trellis/ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { lazy, Suspense } from "react";
import { useApp } from "../../../lib/appContext";
import { formatCount } from "../../../lib/format";
import { projectRefOfPathname, projectSlashPath } from "../../../lib/projectPath";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { ProjectKey } from "../../shell/ProjectKey";

const ProjectRowActions = lazy(async () => ({ default: (await import("../ProjectRowActions")).ProjectRowActions }));

type Row = { project: ProjectSummary; depth: number; children: ProjectSummary[]; open: boolean };

// A level indents 16 px. The chevron sits over the 16 px slot that opens
// each row, so its offset follows the indent. The button is wrapped, because
// its own hit-area classes position it and would override `absolute`.
const indent = ["pl-2", "pl-4", "pl-8", "pl-12"] as const;
const chevronLeft = ["left-1", "left-3", "left-7", "left-11"] as const;

const byPosition = (a: ProjectSummary, b: ProjectSummary) => a.position - b.position;

// The rows in display order: roots by position, then each open root's
// children by position, and so on down. A row whose subtree holds the
// active project is open whatever the stored state says.
const flatten = (projects: ProjectSummary[], expanded: Record<string, boolean>, activeRef: string | null): Row[] => {
	const children = new Map<string | null, ProjectSummary[]>();
	for (const project of projects) {
		const list = children.get(project.parentId) ?? [];
		list.push(project);
		children.set(project.parentId, list);
	}
	const rows: Row[] = [];
	const walk = (parentId: string | null, depth: number) => {
		for (const project of (children.get(parentId) ?? []).sort(byPosition)) {
			const own = children.get(project.id) ?? [];
			const holdsActive = activeRef?.startsWith(`${project.path}.`) ?? false;
			const open = own.length > 0 && (holdsActive || (expanded[project.id] ?? true));
			rows.push({ project, depth, children: own, open });
			if (open) walk(project.id, depth + 1);
		}
	};
	walk(null, 0);
	return rows;
};

// The project tree in the sidebar. A root row shows its key; a sub-project
// shares the root key and shows its name only. Every row shows the open
// count and links to the project's table. Expansion persists in uiStore.
export function ProjectTree() {
	const { orpc } = useApp();
	const { data } = useQuery(orpc.projects.list.queryOptions({ input: {} }));
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const expanded = useUiStore((state) => state.expandedProjects);
	const activeRef = projectRefOfPathname(pathname);
	if (data === undefined) return <nav aria-label="Projects" data-project-tree="" />;
	const rows = flatten(data, expanded, activeRef);
	return (
		<nav aria-label="Projects" data-project-tree="">
			<ul className="flex flex-col gap-0.5">
				{rows.map(({ project, depth, children, open }) => {
					const level = Math.min(depth, indent.length - 1);
					const active = project.path === activeRef;
					return (
						<li key={project.id} className="relative">
							{children.length > 0 && (
								<span className={cx("absolute top-0.5 z-10", chevronLeft[level])}>
									<IconButton
										size="sm"
										label={`${open ? "Collapse" : "Expand"} ${project.name}`}
										aria-expanded={open}
										icon={open ? <ChevronDown /> : <ChevronRight />}
										className="text-fg-faint"
										onClick={() => uiActions.toggleProject(project.id)}
									/>
								</span>
							)}
							<Link
								to="/p/$"
								params={{ _splat: projectSlashPath(project.path) }}
								activeOptions={{ exact: true, includeSearch: false }}
								aria-current={active ? "page" : undefined}
								className={cx(
									"flex h-7 items-center gap-1.5 rounded-md pr-9 transition-colors duration-hover hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
									indent[level],
									active ? "bg-accent-soft text-fg" : "text-fg-muted",
								)}
							>
								<span aria-hidden="true" className="size-4 shrink-0" />
								{depth === 0 && <ProjectKey projectKey={project.key} />}
								<span className="truncate">{project.name}</span>
								<span className={cx("ml-auto text-xs tabular", active ? "font-semibold text-accent" : "text-fg-faint")}>
									{formatCount(project.openCount)}
								</span>
							</Link>
							<span className="absolute top-0 right-0 z-10">
								<Suspense fallback={null}>
									<ProjectRowActions project={project} />
								</Suspense>
							</span>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
