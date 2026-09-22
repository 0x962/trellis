import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { cx, IconButton, Tooltip, TrellisMark, WorkingAgentText } from "@trellis/ui";
import { type KeyboardEvent, lazy, Suspense } from "react";
import { formatCount } from "../../../../lib/format";
import { projectSlashPath } from "../../../../lib/projectPath";

const ProjectRowActions = lazy(async () => ({ default: (await import("../../ProjectRowActions")).ProjectRowActions }));

export type TreeRowProps = {
	project: ProjectSummary;
	// Each level indents the row 12 px.
	depth: number;
	// An archived row uses faint text.
	archived?: boolean;
	workingCount?: number;
	expanded?: boolean;
	onToggle?: () => void;
};

const indent = ["pl-2", "pl-5", "pl-8", "pl-11"] as const;

// The trailing slot reserves space for the project menu on hover and focus.
export function TreeRow({ project, depth, archived = false, workingCount = 0, expanded, onToggle }: TreeRowProps) {
	const hasDisclosure = expanded !== undefined && onToggle !== undefined;
	const DisclosureIcon = expanded ? CaretDown : CaretRight;
	const count = project.openCount > 0 ? formatCount(project.openCount) : null;
	const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
		if (!hasDisclosure) return;
		if (event.key === "ArrowLeft" && expanded) {
			event.preventDefault();
			onToggle();
		}
		if (event.key === "ArrowRight" && !expanded) {
			event.preventDefault();
			onToggle();
		}
	};
	return (
		<li
			className={cx(
				"group/row sidebar-row relative text-sm hover:bg-elevated",
				indent[Math.min(depth, indent.length - 1)],
				archived ? "text-fg-faint" : "font-medium text-fg",
			)}
		>
			{hasDisclosure && (
				<IconButton
					size="xs"
					label={`${expanded ? "Collapse" : "Expand"} ${project.name}`}
					icon={<DisclosureIcon />}
					aria-expanded={expanded}
					onClick={onToggle}
					className={cx(
						"mr-0.5 border-transparent bg-transparent text-fg-faint hover:bg-control-hover hover:text-fg active:bg-control-active",
						expanded
							? "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100"
							: "opacity-100",
					)}
				/>
			)}
			<Link
				to="/p/$"
				params={{ _splat: projectSlashPath(project.path) }}
				onKeyDown={onKeyDown}
				className="flex h-8 min-w-0 flex-1 items-center rounded-md transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11"
			>
				<Tooltip content="Project">
					<span role="img" aria-label="Project" className="sidebar-leading text-fg-faint">
						<TrellisMark className="size-6" background={false} />
					</span>
				</Tooltip>
				{workingCount > 0 ? (
					<WorkingAgentText
						data-slot="label"
						count={workingCount}
						variant="static"
						title={project.name}
						className="sidebar-label"
					>
						{project.name}
					</WorkingAgentText>
				) : (
					<span data-slot="label" title={project.name} className="sidebar-label">
						{project.name}
					</span>
				)}
				<span data-slot="trailing" className="sidebar-trailing text-fg-faint">
					{count}
				</span>
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
