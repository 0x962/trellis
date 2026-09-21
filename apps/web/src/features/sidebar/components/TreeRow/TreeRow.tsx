import type { ProjectSummary } from "@trellis/api";
import { cx, Tooltip, TrellisMark, WorkingAgentText } from "@trellis/ui";
import { lazy, Suspense } from "react";

const ProjectRowActions = lazy(async () => ({ default: (await import("../../ProjectRowActions")).ProjectRowActions }));

export type TreeRowProps = {
	project: ProjectSummary;
	// Each level indents the row 12 px.
	depth: number;
	// An archived row uses faint text.
	archived?: boolean;
	workingCount?: number;
};

const indent = ["pl-2", "pl-5", "pl-8", "pl-11"] as const;

// The trailing slot reserves space for the project menu on hover and focus.
export function TreeRow({ project, depth, archived = false, workingCount = 0 }: TreeRowProps) {
	return (
		<li
			className={cx(
				"group/row sidebar-row relative text-sm hover:bg-elevated",
				indent[Math.min(depth, indent.length - 1)],
				archived ? "text-fg-faint" : "font-medium text-fg",
			)}
		>
			<div className="flex h-8 min-w-0 flex-1 items-center rounded-md transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11">
				<Tooltip content="Project">
					<span role="img" aria-label="Project" className="sidebar-leading text-fg-faint">
						<TrellisMark className="size-6" background={false} />
					</span>
				</Tooltip>
				{workingCount > 0 ? (
					<WorkingAgentText data-slot="label" count={workingCount} title={project.name} className="sidebar-label">
						{project.name}
					</WorkingAgentText>
				) : (
					<span data-slot="label" title={project.name} className="sidebar-label">
						{project.name}
					</span>
				)}
				<span data-slot="trailing" className="sidebar-trailing" aria-hidden="true" />
			</div>
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
