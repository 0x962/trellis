import { Link, useRouterState } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx, TrellisMark } from "@trellis/ui";
import { lazy, Suspense } from "react";
import { projectRefOfPathname, projectSlashPath } from "../../../../lib/projectPath";
import { useWorkingAgents } from "../../../agents/useWorkingAgents";

const ProjectRowActions = lazy(async () => ({ default: (await import("../../ProjectRowActions")).ProjectRowActions }));

export type TreeRowProps = {
	project: ProjectSummary;
	// Each level indents the row 12 px.
	depth: number;
	// An archived row uses faint text.
	archived?: boolean;
};

const indent = ["pl-2", "pl-5", "pl-8", "pl-11"] as const;

// The trailing slot reserves space for the project menu on hover and focus.
export function TreeRow({ project, depth, archived = false }: TreeRowProps) {
	const { projectIds } = useWorkingAgents();
	const working = projectIds.includes(project.id);
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	const active = projectRefOfPathname(pathname) === project.path && pathname.endsWith("/settings/manager");
	return (
		<li
			className={cx(
				"group/row sidebar-row relative text-sm hover:bg-elevated",
				indent[Math.min(depth, indent.length - 1)],
				archived ? "text-fg-faint" : "font-medium text-fg",
				active && "sidebar-selected",
			)}
		>
			<Link
				to="/p/$"
				params={{ _splat: `${projectSlashPath(project.path)}/settings/manager` }}
				activeOptions={{ exact: true, includeSearch: false }}
				aria-current={active ? "page" : undefined}
				className="flex h-8 min-w-0 flex-1 items-center rounded-md transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11"
			>
				<span aria-hidden="true" className="sidebar-leading text-fg-faint">
					<TrellisMark background={false} working={working} />
				</span>
				{working && <span className="sr-only">Manager working: </span>}
				<span data-slot="label" title={project.name} className="sidebar-label">
					{project.name}
				</span>
				<span data-slot="trailing" className="sidebar-trailing" aria-hidden="true" />
			</Link>
			<span
				data-slot="menu"
				className="absolute top-1 right-1 flex size-6 pointer-coarse:top-0 pointer-coarse:size-11 items-center justify-center opacity-0 transition-opacity duration-hover ease-out group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100"
			>
				<Suspense fallback={null}>
					<ProjectRowActions project={project} />
				</Suspense>
			</span>
		</li>
	);
}
