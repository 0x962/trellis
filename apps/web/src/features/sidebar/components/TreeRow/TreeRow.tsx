import { Link } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import { lazy, Suspense } from "react";
import { projectSlashPath } from "../../../../lib/projectPath";

const ProjectRowActions = lazy(async () => ({ default: (await import("../../ProjectRowActions")).ProjectRowActions }));

export type TreeRowProps = {
	project: ProjectSummary;
	// The level in the tree. Each level indents the row 16 px.
	depth: number;
	// An archived row uses faint text.
	archived?: boolean;
};

// The row padding per level: 8 px, then 12 px more for each level. The
// name starts at the padding, with nothing in front of it.
const indent = ["pl-2", "pl-5", "pl-8", "pl-11"] as const;

// A project reads as its name alone. The trailing slot reserves space for
// the menu on hover and focus.
export function TreeRow({ project, depth, archived = false }: TreeRowProps) {
	return (
		<li
			className={cx(
				"group/row sidebar-row relative hover:bg-surface",
				indent[Math.min(depth, indent.length - 1)],
				archived ? "text-fg-faint" : "font-medium text-fg",
			)}
		>
			<Link
				to="/p/$"
				params={{ _splat: projectSlashPath(project.path) }}
				activeOptions={{ exact: true, includeSearch: false }}
				className="flex h-7 min-w-0 flex-1 items-center rounded-md transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11"
			>
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
