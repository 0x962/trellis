import { useQuery } from "@tanstack/react-query";
import type { Priority, Status, TicketSummary } from "@trellis/api";
import { Button, cx, PriorityIcon, StatusIcon } from "@trellis/ui";
import { CornerDownRight, FolderOpen } from "lucide-react";
import { useArchivedProjects } from "../../../../../hooks/useArchivedProjects";
import { useApp } from "../../../../../lib/appContext";
import { projectSlashPath } from "../../../../../lib/projectPath";
import { PriorityPicker, priorityLabels } from "../../../../pickers/PriorityPicker";
import { ProjectPicker } from "../../../../pickers/ProjectPicker";
import { StatusPicker } from "../../../../pickers/StatusPicker";
import { TicketPicker } from "../../../../pickers/TicketPicker";

export type ChipRowProps = {
	project: string | undefined;
	// True after a submit without a project: the chip asks for one.
	projectMissing: boolean;
	statuses: readonly Status[];
	status: Status | undefined;
	priority: Priority;
	parent: TicketSummary | null;
	parentRef?: string;
	onProject: (ref: string) => void;
	onStatus: (status: Status) => void;
	onPriority: (priority: Priority) => void;
	onParent: (ticket: TicketSummary | null) => void;
};

// The property chips under the description: project, status, priority,
// parent. Each one opens the same picker the rail and the table use.
export function ChipRow({
	project,
	projectMissing,
	statuses,
	status,
	priority,
	parent,
	parentRef,
	onProject,
	onStatus,
	onPriority,
	onParent,
}: ChipRowProps) {
	const { orpc } = useApp();
	const { isArchived } = useArchivedProjects();
	// An archived project takes no new ticket, so the picker leaves it out.
	const projects = (useQuery(orpc.projects.list.queryOptions({ input: {} })).data ?? []).filter(
		(entry) => !isArchived(entry.path),
	);
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<ProjectPicker
				projects={projects}
				value={project}
				onPick={onProject}
				trigger={
					<Button size="sm" icon={<FolderOpen />} className={cx(projectMissing && "border-danger text-danger")}>
						Project: {project === undefined ? "Choose one" : projectSlashPath(project)}
					</Button>
				}
			/>
			<StatusPicker
				statuses={statuses}
				value={status?.id}
				onPick={onStatus}
				trigger={
					<Button
						size="sm"
						disabled={statuses.length === 0}
						icon={
							status === undefined ? undefined : (
								<StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} />
							)
						}
					>
						Status: {status?.name ?? "None"}
					</Button>
				}
			/>
			<PriorityPicker
				value={priority}
				onPick={onPriority}
				trigger={
					<Button size="sm" icon={<PriorityIcon priority={priority} />}>
						Priority: {priorityLabels[priority]}
					</Button>
				}
			/>
			<TicketPicker
				project={project}
				value={parent?.identifier ?? parentRef}
				onPick={onParent}
				trigger={
					<Button size="sm" icon={<CornerDownRight />}>
						Parent: {parent?.identifier ?? parentRef ?? "None"}
					</Button>
				}
			/>
		</div>
	);
}
