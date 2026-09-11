import { Link } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { lazy, Suspense } from "react";
import { projectSlashPath } from "../../../../lib/projectPath";

const ProjectRowActions = lazy(async () => ({ default: (await import("../../ProjectRowActions")).ProjectRowActions }));

export type TreeRowProps = {
	project: ProjectSummary;
	// The level in the tree. Each level indents the row 16 px.
	depth: number;
	// The chevron of a row with children.
	expander?: { open: boolean; onToggle: () => void };
	// An archived row uses faint text.
	archived?: boolean;
};

// The row padding per level: 4 px, then 16 px more for each level. The
// chevron sits inside that padding, so a row with children and a row
// without one start their icon at the same place.
const indent = ["pl-1", "pl-5", "pl-9", "pl-13"] as const;

// The chevron leads the row, before the folder, the way a file tree reads.
// It is a button beside the link, so opening a project never navigates. The
// trailing slot reserves space for the menu on hover and focus.
export function TreeRow({ project, depth, expander, archived = false }: TreeRowProps) {
	return (
		<li
			className={cx(
				"group/row sidebar-row relative hover:bg-surface",
				indent[Math.min(depth, indent.length - 1)],
				archived ? "text-fg-faint" : "font-medium text-fg",
			)}
		>
			<span data-slot="disclosure" className="flex size-5 shrink-0 items-center justify-center">
				{expander && (
					<button
						type="button"
						aria-label={`${expander.open ? "Collapse" : "Expand"} ${project.name}`}
						aria-expanded={expander.open}
						onClick={expander.onToggle}
						className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-fg-faint transition-colors duration-hover ease-out hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
					>
						<span aria-hidden="true" className="inline-flex size-3 *:size-full">
							{expander.open ? <ChevronDown /> : <ChevronRight />}
						</span>
					</button>
				)}
			</span>
			<Link
				to="/p/$"
				params={{ _splat: projectSlashPath(project.path) }}
				activeOptions={{ exact: true, includeSearch: false }}
				className="flex h-7 min-w-0 flex-1 items-center rounded-md transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11"
			>
				<span data-slot="leading" className="sidebar-leading">
					{project.depth === 0 ? (
						<Folder aria-hidden="true" className="size-4" strokeWidth={1.75} />
					) : (
						<span aria-hidden="true" className="size-1.5 rounded-sm bg-fg-faint" />
					)}
				</span>
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
