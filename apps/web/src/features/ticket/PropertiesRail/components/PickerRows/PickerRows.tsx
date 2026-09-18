import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import type { Priority, Status, Ticket } from "@trellis/api";
import { Button, PriorityIcon, PropertyRow, StatusIcon, TicketId, useHotkey } from "@trellis/ui";
import { useEffect, useState } from "react";
import { useArchivedProjects } from "../../../../../hooks/useArchivedProjects";
import { useApp } from "../../../../../lib/appContext";
import { failToast } from "../../../../../lib/failToast";
import { projectSlashPath } from "../../../../../lib/projectPath";
import { PriorityPicker, priorityLabels } from "../../../../pickers/PriorityPicker";
import { ProjectPicker } from "../../../../pickers/ProjectPicker";
import { StatusPicker } from "../../../../pickers/StatusPicker";
import { TicketPicker } from "../../../../pickers/TicketPicker";
import { ProjectKey } from "../../../../shell/ProjectKey";
import { useStatuses } from "../../../hooks/useStatuses";
import { useTicketWrite } from "../../../hooks/useTicketWrite";
import { type PickerKind, usePickerStore } from "../../../stores/pickerStore";

export type PickerRowsProps = {
	ticket: Ticket;
};

const triggerClass = "-ml-2 max-w-full justify-start font-normal";

const summaryOf = (status: Status) => ({
	id: status.id,
	slug: status.slug,
	name: status.name,
	category: status.category,
	reviewer: status.reviewer,
	color: status.color,
});

// The four rows a person changes through a picker: status, priority,
// project, and parent. Each pick paints at once and rolls back with a
// toast on failure. A refused project move shows its reason inside the
// picker. The s, p, Shift+P, and m keys open the pickers from anywhere on
// the page. The status picker lists the effective statuses of the ticket's
// project.
export function PickerRows({ ticket }: PickerRowsProps) {
	const { orpc } = useApp();
	const { write } = useTicketWrite(ticket.identifier);
	const statuses = useStatuses(ticket.project.path);
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} })).data ?? [];
	const ticketRootId = projects.find((entry) => entry.id === ticket.project.id)?.rootId;
	const open = usePickerStore((state) => state.open);
	const setOpen = usePickerStore((state) => state.setOpen);
	const [projectError, setProjectError] = useState<string | null>(null);

	// A ticket under an archived project takes no write, so its keys open no picker.
	const readOnly = useArchivedProjects().isArchived(ticket.project.path);
	const openByKey = (kind: PickerKind) => () => {
		if (!readOnly) setOpen(kind);
	};

	useEffect(() => () => setOpen(null), [setOpen]);
	useHotkey("s", openByKey("status"));
	useHotkey("p", openByKey("priority"));
	useHotkey("shift+p", openByKey("parent"));
	useHotkey("m", openByKey("project"));

	const openChange = (kind: PickerKind) => (next: boolean) => setOpen(next ? kind : null);

	const pickStatus = async (status: Status) => {
		setOpen(null);
		try {
			await write((client) => client.tickets.update({ ticket: ticket.identifier, status: status.slug }), {
				optimistic: (row) => ({ ...row, status: summaryOf(status) }),
			});
		} catch (error) {
			failToast(`${ticket.identifier} did not move to ${status.name}.`, error, () => void pickStatus(status));
		}
	};

	const pickPriority = async (priority: Priority) => {
		setOpen(null);
		try {
			await write((client) => client.tickets.update({ ticket: ticket.identifier, priority }), {
				optimistic: (row) => ({ ...row, priority }),
			});
		} catch (error) {
			failToast(
				`The priority of ${ticket.identifier} did not change to ${priorityLabels[priority]}.`,
				error,
				() => void pickPriority(priority),
			);
		}
	};

	// The picker stays open through the write, so a refusal shows inside it.
	const pickProject = async (path: string) => {
		const project = projects.find((entry) => entry.path === path)!;
		setProjectError(null);
		try {
			await write((client) => client.tickets.update({ ticket: ticket.identifier, project: project.path }), {
				optimistic: (row) => ({ ...row, project: { id: project.id, key: project.key, path: project.path } }),
			});
			setOpen(null);
		} catch (error) {
			if (error instanceof ORPCError && error.code === "CROSS_ROOT_MOVE") {
				setProjectError(error.message);
				return;
			}
			setOpen(null);
			failToast(
				`${ticket.identifier} did not move to ${projectSlashPath(project.path)}.`,
				error,
				() => void pickProject(path),
			);
		}
	};

	const pickParent = async (parent: { id: string; identifier: string } | null) => {
		setOpen(null);
		try {
			await write(
				(client) =>
					client.tickets.update({ ticket: ticket.identifier, parent: parent === null ? null : parent.identifier }),
				{ optimistic: (row) => ({ ...row, parent }) },
			);
		} catch (error) {
			failToast(`The parent of ${ticket.identifier} did not change.`, error, () => void pickParent(parent));
		}
	};

	return (
		<>
			<PropertyRow compact label="Status">
				<StatusPicker
					trigger={
						<Button variant="quiet" className={triggerClass}>
							<span className="inline-flex items-center gap-1.5">
								<StatusIcon category={ticket.status.category} reviewer={ticket.status.reviewer ?? undefined} />
								{ticket.status.name}
							</span>
						</Button>
					}
					statuses={statuses}
					value={ticket.status.id}
					onPick={(status) => void pickStatus(status)}
					open={open === "status"}
					onOpenChange={openChange("status")}
				/>
			</PropertyRow>
			<PropertyRow compact label="Priority">
				<PriorityPicker
					trigger={
						<Button variant="quiet" className={triggerClass}>
							<span className="inline-flex items-center gap-1.5">
								<PriorityIcon priority={ticket.priority} />
								{priorityLabels[ticket.priority]}
							</span>
						</Button>
					}
					value={ticket.priority}
					onPick={(priority) => void pickPriority(priority)}
					open={open === "priority"}
					onOpenChange={openChange("priority")}
				/>
			</PropertyRow>
			<PropertyRow compact label="Project">
				<ProjectPicker
					trigger={
						<Button variant="quiet" className={triggerClass}>
							<span className="inline-flex items-center gap-1.5">
								<ProjectKey projectKey={ticket.project.key} />
								<span className="truncate text-sm">{ticket.project.path.split(".").slice(1).join("/")}</span>
							</span>
						</Button>
					}
					projects={projects}
					ticketRootIds={ticketRootId === undefined ? [] : [ticketRootId]}
					value={ticket.project.path}
					onPick={(path) => void pickProject(path)}
					open={open === "project"}
					onOpenChange={(next) => {
						if (!next) setProjectError(null);
						openChange("project")(next);
					}}
					error={projectError}
					keepOpenOnPick
				/>
			</PropertyRow>
			<PropertyRow compact label="Parent">
				<TicketPicker
					trigger={
						<Button variant="quiet" className={triggerClass}>
							{ticket.parent === null ? (
								<span className="text-fg-muted">None</span>
							) : (
								<TicketId id={ticket.parent.identifier} />
							)}
						</Button>
					}
					project={ticket.project.key}
					exclude={[ticket.identifier]}
					value={ticket.parent?.identifier}
					onPick={(parent) =>
						void pickParent(parent === null ? null : { id: parent.id, identifier: parent.identifier })
					}
					open={open === "parent"}
					onOpenChange={openChange("parent")}
				/>
			</PropertyRow>
		</>
	);
}
