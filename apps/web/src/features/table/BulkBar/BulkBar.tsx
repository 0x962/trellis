import type { Priority, ProjectSummary, StatusSummary, TicketSummary } from "@trellis/api";
import { Button, cx } from "@trellis/ui";
import { animate } from "motion/mini";
import { useEffect } from "react";
import { formatCount } from "../../../lib/format";
import { PriorityPicker } from "../../pickers/PriorityPicker";
import { ProjectPicker } from "../../pickers/ProjectPicker";
import { StatusPicker } from "../../pickers/StatusPicker";
import { TicketPicker } from "../../pickers/TicketPicker";

export type BulkBarProps = {
	count: number;
	statuses: readonly StatusSummary[];
	projects: readonly ProjectSummary[];
	// The project ref the parent search stays inside.
	project?: string;
	onStatus: (status: StatusSummary) => void;
	onPriority: (priority: Priority) => void;
	onProject: (ref: string) => void;
	onParent: (ticket: TicketSummary | null) => void;
	onCopyIds: () => void;
	onDelete: () => void;
};

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The floating toolbar over a selection: one button per bulk action. It
// rises 180 ms on mount; under reduced motion it appears in place.
export function BulkBar({
	count,
	statuses,
	projects,
	project,
	onStatus,
	onPriority,
	onProject,
	onParent,
	onCopyIds,
	onDelete,
}: BulkBarProps) {
	useEffect(() => {
		if (reduced()) return;
		animate(
			"[data-bulk-bar]",
			{ opacity: [0, 1], transform: ["translate(-50%, 16px)", "translate(-50%, 0px)"] },
			{ duration: 0.18 },
		);
	}, []);

	return (
		<div
			data-bulk-bar=""
			role="toolbar"
			aria-label="Bulk actions"
			className={cx(
				"fixed bottom-4 left-1/2 z-40 flex h-11 w-120 max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1.5 rounded-lg border border-border bg-elevated px-3 shadow-lg",
			)}
		>
			<span className="mr-1 text-sm font-medium text-fg tabular">{formatCount(count)} selected</span>
			<StatusPicker statuses={statuses} onPick={onStatus} side="top" trigger={<Button size="sm">Status</Button>} />
			<PriorityPicker onPick={onPriority} side="top" trigger={<Button size="sm">Priority</Button>} />
			<ProjectPicker
				projects={projects}
				onPick={onProject}
				side="top"
				trigger={<Button size="sm">Move to project</Button>}
			/>
			<TicketPicker project={project} onPick={onParent} side="top" trigger={<Button size="sm">Set parent</Button>} />
			<Button size="sm" variant="quiet" onClick={onCopyIds}>
				Copy IDs
			</Button>
			<Button size="sm" variant="quiet" className="text-danger hover:text-danger" onClick={onDelete}>
				Delete
			</Button>
		</div>
	);
}
