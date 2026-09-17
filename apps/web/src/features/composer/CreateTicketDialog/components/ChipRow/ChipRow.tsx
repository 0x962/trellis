import { ArrowElbowDownRight, FolderOpen } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { Priority, Status, TicketSummary } from "@trellis/api";
import { cx, PriorityIcon, StatusIcon } from "@trellis/ui";
import type { ReactNode } from "react";
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

type ChipProps = {
	// The accessible name, "Project: CDE/web". The chip shows the value only.
	label: string;
	icon: ReactNode;
	children: ReactNode;
	// True for a property with no value: a dashed border and faint text.
	unset?: boolean;
	invalid?: boolean;
	disabled?: boolean;
};

// One property chip: 28 px, the icon, then the value. The pickers pass
// their own props to the element they clone, so it is a plain button.
const chip = ({ label, icon, children, unset = false, invalid = false, disabled = false }: ChipProps) => (
	<button
		type="button"
		aria-label={label}
		aria-invalid={invalid || undefined}
		aria-describedby={invalid ? "new-ticket-project-error" : undefined}
		disabled={disabled}
		className={cx(
			"inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-sm whitespace-nowrap transition-colors duration-hover ease-out",
			"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 enabled:hover:border-border-strong",
			invalid
				? "border-danger text-danger"
				: unset
					? "border-dashed border-border text-fg-faint"
					: "border-border text-fg",
		)}
	>
		<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 *:size-full">
			{icon}
		</span>
		{children}
	</button>
);

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
	const projectName = project === undefined ? "Choose a project" : projectSlashPath(project);
	const parentName = parent?.identifier ?? parentRef;
	return (
		<div className="flex flex-col gap-1 px-2 pb-2 pt-1">
			<div className="flex flex-wrap items-center gap-1.5">
				<ProjectPicker
					projects={projects}
					value={project}
					onPick={onProject}
					trigger={chip({
						label: `Project: ${projectName}`,
						icon: <FolderOpen />,
						unset: project === undefined,
						invalid: projectMissing,
						children: projectName,
					})}
				/>
				<StatusPicker
					statuses={statuses}
					value={status?.id}
					onPick={onStatus}
					trigger={chip({
						label: `Status: ${status?.name ?? "None"}`,
						icon:
							status === undefined ? undefined : (
								<StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} />
							),
						disabled: statuses.length === 0,
						children: status?.name ?? "Status",
					})}
				/>
				<PriorityPicker
					value={priority}
					onPick={onPriority}
					trigger={chip({
						label: `Priority: ${priorityLabels[priority]}`,
						icon: <PriorityIcon priority={priority} />,
						unset: priority === "none",
						children: priority === "none" ? "Priority" : priorityLabels[priority],
					})}
				/>
				<TicketPicker
					project={project}
					value={parentName}
					onPick={onParent}
					trigger={chip({
						label: `Parent: ${parentName ?? "None"}`,
						icon: <ArrowElbowDownRight />,
						unset: parentName === undefined,
						children: parentName ?? "Parent",
					})}
				/>
			</div>
			{projectMissing && (
				<p id="new-ticket-project-error" role="alert" className="text-xs text-danger">
					Choose a project.
				</p>
			)}
		</div>
	);
}
