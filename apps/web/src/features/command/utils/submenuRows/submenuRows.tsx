import { ArrowBendUpLeft } from "@phosphor-icons/react";
import type { Label, LabelGroup, Status, TicketSummary } from "@trellis/api";
import { LabelDot, PriorityIcon, StatusIcon } from "@trellis/ui";
import {
	bulkChangeStatus,
	bulkMoveToProject,
	bulkSetLabel,
	bulkSetPriority,
	changeStatus,
	moveToProject,
	setLabel,
	setParent,
	setPriority,
} from "../../actions";
import type { PaletteRow, RowDeps, Submenu } from "../../rows";
import { priorityLabels } from "../../rows";
import { projectRows } from "../projectRows";
import { viewHref } from "../viewHref";
import { gotoProjectRows } from "../viewRows";

// The values a submenu offers. One ticket writes through tickets.update
// and a selection writes through one tickets.updateMany call.

export const submenuHeadings: Record<Submenu["kind"], string> = {
	status: "Change status",
	priority: "Set priority",
	project: "Move to project",
	parent: "Set parent",
	labels: "Set labels",
	sort: "Sort by",
	group: "Group by",
	goto: "Go to project",
};

export type SubmenuData = {
	// The statuses of the project the submenu was opened in.
	statuses: Status[];
	// The tickets a parent can be picked from.
	tickets: TicketSummary[];
	// The labels of the project tree, and the groups that name them.
	labels: Label[];
	labelGroups: LabelGroup[];
};

// "Bug", or "Type / Bug" for a label that belongs to a group.
const labelText = (label: Label, groups: readonly LabelGroup[]) => {
	const group = groups.find((candidate) => candidate.id === label.groupId);
	return group === undefined ? label.name : `${group.name} / ${label.name}`;
};

const sorts = [
	{ value: "-updatedAt", label: "Updated" },
	{ value: "-createdAt", label: "Created" },
	{ value: "priority", label: "Priority" },
	{ value: "status", label: "Status" },
	{ value: "-number", label: "ID" },
	{ value: "position", label: "Manual order" },
] as const;

const groups = [
	{ value: "status", label: "Status" },
	{ value: "priority", label: "Priority" },
	{ value: "project", label: "Project" },
	{ value: "parent", label: "Parent" },
	{ value: "pr", label: "PR" },
	{ value: "none", label: "None" },
] as const;

const writeTickets = (deps: RowDeps, tickets: string[], one: () => void, many: () => void) => () => {
	deps.close();
	if (tickets.length === 1) one();
	else many();
};

export const submenuRows = (submenu: Submenu, deps: RowDeps, data: SubmenuData): PaletteRow[] => {
	const { action } = deps;
	if (submenu.kind === "status") {
		return data.statuses.map((status) => ({
			value: `status.${status.id}`,
			label: status.name,
			icon: <StatusIcon category={status.category} reviewer={status.reviewer ?? "human"} />,
			keywords: [status.slug],
			run: writeTickets(
				deps,
				submenu.tickets,
				() => void changeStatus(action, submenu.tickets[0]!, status.slug),
				() => void bulkChangeStatus(action, submenu.tickets, status.slug),
			),
		}));
	}
	if (submenu.kind === "priority") {
		return Object.entries(priorityLabels).map(([priority, label]) => ({
			value: `priority.${priority}`,
			label,
			icon: <PriorityIcon priority={priority as keyof typeof priorityLabels} />,
			run: writeTickets(
				deps,
				submenu.tickets,
				() => void setPriority(action, submenu.tickets[0]!, priority as keyof typeof priorityLabels),
				() => void bulkSetPriority(action, submenu.tickets, priority as keyof typeof priorityLabels),
			),
		}));
	}
	if (submenu.kind === "project") {
		return projectRows(
			deps.projects,
			(project) => `project.${project.id}`,
			(project) =>
				writeTickets(
					deps,
					submenu.tickets,
					() => void moveToProject(action, submenu.tickets[0]!, project.path),
					() => void bulkMoveToProject(action, submenu.tickets, project.path),
				),
		);
	}
	if (submenu.kind === "labels") {
		return data.labels.map((label) => {
			const held = submenu.checked.includes(label.id);
			return {
				value: `label.${label.id}`,
				label: labelText(label, data.labelGroups),
				sub: held ? "Remove" : undefined,
				icon: <LabelDot color={label.color} variant="icon" />,
				run: writeTickets(
					deps,
					submenu.tickets,
					() => void setLabel(action, submenu.tickets[0]!, label.id, !held),
					() => void bulkSetLabel(action, submenu.tickets, label.id, !held),
				),
			};
		});
	}
	if (submenu.kind === "goto") return gotoProjectRows(deps);
	if (submenu.kind === "parent") {
		const none: PaletteRow = {
			value: "parent.none",
			label: "No parent",
			icon: <ArrowBendUpLeft />,
			run: () => {
				deps.close();
				void setParent(action, submenu.ticket, null);
			},
		};
		const rows = data.tickets
			.filter((ticket) => ticket.identifier !== submenu.ticket)
			.map((ticket) => ({
				value: `parent.${ticket.identifier}`,
				label: ticket.title,
				sub: ticket.identifier,
				mono: true,
				run: () => {
					deps.close();
					void setParent(action, submenu.ticket, ticket.identifier);
				},
			}));
		return [none, ...rows];
	}
	const field = submenu.kind === "sort" ? "sort" : "group";
	const options = submenu.kind === "sort" ? sorts : groups;
	return options.map((option) => ({
		value: `${field}.${option.value}`,
		label: option.label,
		run: () => {
			deps.close();
			action.navigate(viewHref(deps.pathname, deps.search, { [field]: option.value }));
		},
	}));
};
