import { Link } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { lazy, Suspense } from "react";
import { projectSlashPath } from "../../../../lib/projectPath";

const ProjectRowActions = lazy(async () => ({ default: (await import("../../ProjectRowActions")).ProjectRowActions }));

export type TreeRowProps = {
	project: ProjectSummary;
	// The level in the tree. Each level indents the row 20 px.
	depth: number;
	active: boolean;
	// The chevron of a row with children.
	expander?: { open: boolean; onToggle: () => void };
	// An archived row uses faint text.
	archived?: boolean;
};

// The row padding per level: 8 px, then 20 px more for each level.
const indent = ["pl-2", "pl-7", "pl-12", "pl-17"] as const;

// The disclosure button is beside the link so expansion does not navigate.
// The trailing slot reserves space for the menu on hover and focus.
export function TreeRow({ project, depth, active, expander, archived = false }: TreeRowProps) {
	return (
		<li
			className={cx(
				"group/row relative flex h-8 items-center rounded-md pr-1 transition-colors duration-hover ease-out hover:bg-surface pointer-coarse:h-11",
				indent[Math.min(depth, indent.length - 1)],
				active ? "sidebar-selected font-medium" : archived ? "text-fg-faint" : "text-fg-muted",
			)}
		>
			<span
				data-slot="disclosure"
				className="absolute right-7 pointer-coarse:right-12 flex w-7 pointer-coarse:w-11 shrink-0 items-center justify-center"
			>
				{expander && (
					<button
						type="button"
						aria-label={`${expander.open ? "Collapse" : "Expand"} ${project.name}`}
						aria-expanded={expander.open}
						onClick={expander.onToggle}
						className="relative inline-flex size-7 items-center justify-center rounded-sm text-fg-faint transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1 pointer-coarse:size-11"
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
				aria-current={active ? "page" : undefined}
				className="flex h-8 min-w-0 flex-1 items-center rounded-md transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11"
			>
				<span data-slot="leading" className="sidebar-leading">
					{project.depth === 0 ? (
						<Folder aria-hidden="true" className="size-4" strokeWidth={1.75} />
					) : (
						<span aria-hidden="true" className="size-1.5 rounded-sm bg-fg-faint" />
					)}
				</span>
				<span
					data-slot="label"
					title={project.name}
					className={cx("sidebar-label", expander && "mr-7 pointer-coarse:mr-11")}
				>
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
