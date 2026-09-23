import type { ProjectSummary } from "@trellis/api";
import { cx, ProjectMark, Tooltip } from "@trellis/ui";
import { type KeyboardEvent, lazy, Suspense } from "react";

const ProjectRowActions = lazy(async () => ({ default: (await import("../../ProjectRowActions")).ProjectRowActions }));

export type TreeRowProps = {
	project: ProjectSummary;
	// An archived row uses faint text.
	archived?: boolean;
	expanded?: boolean;
	onToggle?: () => void;
};

// The trailing slot reserves space for the project menu on hover and focus.
export function TreeRow({ project, archived = false, expanded, onToggle }: TreeRowProps) {
	const hasDisclosure = expanded !== undefined && onToggle !== undefined;
	const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
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
				"pl-2",
				archived ? "text-fg-faint" : "font-medium text-fg",
			)}
		>
			<button
				type="button"
				aria-expanded={hasDisclosure ? expanded : undefined}
				onClick={onToggle}
				onKeyDown={onKeyDown}
				className="flex h-8 min-w-0 flex-1 items-center rounded-md p-0 text-left transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11"
			>
				<Tooltip content="Project">
					<span role="img" aria-label="Project" className="sidebar-leading text-fg-faint">
						<ProjectMark color={project.color} className="size-6" />
					</span>
				</Tooltip>
				<span data-slot="label" title={project.name} className="sidebar-label">
					{project.name}
				</span>
				<span data-slot="trailing" className="sidebar-trailing" aria-hidden="true" />
			</button>
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
