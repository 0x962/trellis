import { Link } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { lazy, Suspense } from "react";
import { formatCount } from "../../../../lib/format";
import { projectSlashPath } from "../../../../lib/projectPath";
import { ProjectKey } from "../../../shell/ProjectKey";

const ProjectRowActions = lazy(async () => ({ default: (await import("../../ProjectRowActions")).ProjectRowActions }));

export type TreeRowProps = {
	project: ProjectSummary;
	// The level in the tree. Each level indents the row 20 px.
	depth: number;
	active: boolean;
	// The chevron of a row with children.
	expander?: { open: boolean; onToggle: () => void };
	// An archived row reads faint and shows no count.
	archived?: boolean;
};

// The row padding per level: 8 px, then 20 px more for each level.
const indent = ["pl-2", "pl-7", "pl-12", "pl-17"] as const;

// One project row of the sidebar tree. Every row has the same three slots:
// a 16 px disclosure slot, a 4 px gap, and a 28 px leading slot. A level
// therefore moves the name 20 px, and a leaf row keeps the empty disclosure
// slot. The chevron is a button beside the link, because a button inside a
// link is not valid HTML.
//
// The count and the row menu share one 24 px slot at the right end. At rest
// the count shows. On hover, on keyboard focus inside the row, and on a
// screen with no hover, the menu takes its place.
export function TreeRow({ project, depth, active, expander, archived = false }: TreeRowProps) {
	return (
		<li
			className={cx(
				"group/row relative flex h-7 items-center rounded-md pr-1 transition-colors duration-hover ease-out hover:bg-surface",
				indent[Math.min(depth, indent.length - 1)],
				active ? "bg-accent-soft text-fg" : archived ? "text-fg-faint" : "text-fg-muted",
			)}
		>
			<span data-slot="disclosure" className="flex w-4 shrink-0 items-center justify-center">
				{expander && (
					<button
						type="button"
						aria-label={`${expander.open ? "Collapse" : "Expand"} ${project.name}`}
						aria-expanded={expander.open}
						onClick={expander.onToggle}
						className="relative inline-flex size-4 items-center justify-center rounded-sm text-fg-faint transition-colors duration-hover ease-out before:absolute before:-inset-1.5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1 pointer-coarse:before:-inset-3.5"
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
				className="ml-1 flex h-7 min-w-0 flex-1 items-center rounded-md transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
			>
				<span data-slot="leading" className="flex w-7 shrink-0 items-center justify-center">
					{project.depth === 0 ? (
						<ProjectKey projectKey={project.key} />
					) : (
						<span aria-hidden="true" className="size-1.5 rounded-full bg-fg-faint" />
					)}
				</span>
				<span className="min-w-0 flex-1 truncate">{project.name}</span>
				<span data-slot="trailing" className="flex w-6 shrink-0 items-center justify-center">
					{!archived && (
						<span
							className={cx(
								"text-xs tabular transition-opacity duration-hover ease-out group-focus-within/row:opacity-0 group-hover/row:opacity-0 [@media(hover:none)]:opacity-0",
								active ? "font-semibold text-accent" : "text-fg-faint",
							)}
						>
							{formatCount(project.openCount)}
						</span>
					)}
				</span>
			</Link>
			<span
				data-slot="menu"
				className="absolute top-0.5 right-1 flex size-6 items-center justify-center opacity-0 transition-opacity duration-hover ease-out group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100"
			>
				<Suspense fallback={null}>
					<ProjectRowActions project={project} />
				</Suspense>
			</span>
		</li>
	);
}
