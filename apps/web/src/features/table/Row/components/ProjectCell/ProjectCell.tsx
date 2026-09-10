import type { ProjectSummary } from "@trellis/api";
import type { RefObject } from "react";
import { ProjectPicker } from "../../../../pickers/ProjectPicker";
import { projectLabel } from "../../../utils/groupRows";
import { cellButtonClass } from "../../cellButtonClass";

export type ProjectCellProps = {
	// The ticket's project ref.
	path: string;
	// The viewed project ref, or undefined on /all.
	viewedProject?: string;
	projects: readonly ProjectSummary[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onPick: (ref: string) => void;
	finalFocus: RefObject<HTMLElement | null>;
};

// The project path under the viewed project, which opens the tree picker
// on click or on `m`. The viewed project itself reads as an empty cell.
export function ProjectCell({
	path,
	viewedProject,
	projects,
	open,
	onOpenChange,
	onPick,
	finalFocus,
}: ProjectCellProps) {
	const label = path === viewedProject ? "" : projectLabel(path, viewedProject);
	return (
		<ProjectPicker
			projects={projects}
			value={path}
			open={open}
			onOpenChange={onOpenChange}
			onPick={onPick}
			finalFocus={finalFocus}
			trigger={
				<button type="button" aria-label={`Project: ${path}`} className={cellButtonClass}>
					<span className="truncate text-sm text-fg-muted">{label}</span>
				</button>
			}
		/>
	);
}
