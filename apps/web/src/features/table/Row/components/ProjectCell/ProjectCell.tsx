import type { ProjectSummary } from "@trellis/api";
import { Tooltip } from "@trellis/ui";
import type { RefObject } from "react";
import { projectSlashPath } from "../../../../../lib/projectPath";
import { ProjectPicker } from "../../../../pickers/ProjectPicker";
import { ProjectKey } from "../../../../shell/ProjectKey";
import { cellButtonClass } from "../../cellButtonClass";

export type ProjectCellProps = {
	// The ticket's project ref, `CDE.web`. Its first segment is the key.
	path: string;
	// The viewed project ref, or undefined on /all.
	viewedProject?: string;
	projects: readonly ProjectSummary[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onPick: (ref: string) => void;
	finalFocus: RefObject<HTMLElement | null>;
};

// The project of a row: the key and the last path segment ("CDE web"). In
// a project scope every row shares the key, so the cell drops it, and the
// viewed project itself reads as an empty cell. The Tooltip holds the full
// path. A click or `m` opens the tree picker.
export function ProjectCell({
	path,
	viewedProject,
	projects,
	open,
	onOpenChange,
	onPick,
	finalFocus,
}: ProjectCellProps) {
	const segments = path.split(".");
	const inScope = viewedProject !== undefined;
	const segment = path === viewedProject || segments.length === 1 ? "" : segments.at(-1)!;
	return (
		<Tooltip content={projectSlashPath(path)}>
			<span className="inline-flex max-w-full min-w-0">
				<ProjectPicker
					projects={projects}
					value={path}
					open={open}
					onOpenChange={onOpenChange}
					onPick={onPick}
					finalFocus={finalFocus}
					trigger={
						<button type="button" aria-label={`Project: ${path}`} className={cellButtonClass}>
							{!inScope && <ProjectKey projectKey={segments[0]!} />}
							{segment !== "" && <span className="truncate text-sm text-fg-muted">{segment}</span>}
						</button>
					}
				/>
			</span>
		</Tooltip>
	);
}
