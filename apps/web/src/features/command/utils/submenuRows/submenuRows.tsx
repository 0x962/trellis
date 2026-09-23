import { ArrowBendUpLeft, Flag, Stack } from "@phosphor-icons/react";
import type { EpicSummary, Label, LabelGroup, Status, TicketSummary, WaveSummary } from "@trellis/api";
import { LabelDot, PriorityIcon, StatusIcon } from "@trellis/ui";
import { changeStatus, setEpic, setLabel, setParent, setPriority } from "../../actions";
import type { PaletteRow, RowDeps, Submenu } from "../../rows";
import { priorityLabels } from "../../rows";
import * as bulk from "../bulkChange";
import { viewHref } from "../viewHref";
import { gotoProjectRows } from "../viewRows";

// The values a submenu offers. A submenu the Selection section opened
// carries `bulk`, and its picks write through the bulk path every surface
// shares, over the rows in `deps.selection`. A submenu the This ticket
// section opened writes its one ticket through tickets.update.

export const submenuHeadings: Record<Submenu["kind"], string> = {
	status: "Change status",
	priority: "Set priority",
	parent: "Set parent",
	epic: "Set epic",
	wave: "Set wave",
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
	// The labels of the project, and the groups that name them.
	labels: Label[];
	labelGroups: LabelGroup[];
	// The epics of the project.
	epics: EpicSummary[];
	// The waves of the epic of a wave submenu, in position order.
	waves: readonly WaveSummary[];
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
	{ value: "epic", label: "Epic" },
	{ value: "wave", label: "Wave" },
	{ value: "pr", label: "PR" },
	{ value: "none", label: "None" },
] as const;

// Runs the write a picked row starts. `bulk` on the submenu means the
// Selection section opened it, and `deps.selection` then holds the rows the
// submenu names, one row or many.
const writeTickets = (deps: RowDeps, submenu: { bulk?: true }, one: () => void, many: () => void) => () => {
	deps.close();
	if (submenu.bulk === true) many();
	else one();
};

export const submenuRows = (submenu: Submenu, deps: RowDeps, data: SubmenuData): PaletteRow[] => {
	const { action, selection } = deps;
	if (submenu.kind === "status") {
		return data.statuses.map((status) => ({
			value: `status.${status.id}`,
			label: status.name,
			icon: <StatusIcon category={status.category} reviewer={status.reviewer ?? "human"} />,
			keywords: [status.slug],
			run: writeTickets(
				deps,
				submenu,
				() => void changeStatus(action, submenu.tickets[0]!, status.slug),
				() => void bulk.setStatus(deps.bulk, selection, status),
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
				submenu,
				() => void setPriority(action, submenu.tickets[0]!, priority as keyof typeof priorityLabels),
				() => void bulk.setPriority(deps.bulk, selection, priority as keyof typeof priorityLabels),
			),
		}));
	}
	if (submenu.kind === "labels") {
		return data.labels.map((label) => {
			const held = submenu.checked.includes(label.id);
			const mixed = submenu.mixed.includes(label.id);
			return {
				value: `label.${label.id}`,
				label: labelText(label, data.labelGroups),
				sub: held ? "Remove" : undefined,
				checked: held ? true : mixed ? "mixed" : undefined,
				icon: <LabelDot color={label.color} variant="icon" />,
				run: writeTickets(
					deps,
					submenu,
					() => void setLabel(action, submenu.tickets[0]!, label.id, !held),
					() => void bulk.setLabel(deps.bulk, selection, label, data.labelGroups, !held),
				),
			};
		});
	}
	if (submenu.kind === "goto") return gotoProjectRows(deps);
	if (submenu.kind === "parent") return parentRows(submenu, deps, data);
	if (submenu.kind === "epic") return epicRows(submenu, deps, data);
	if (submenu.kind === "wave") return waveRows(deps, data);
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

// A ticket cannot be its own parent, so the one ticket of a single write
// leaves the list.
const parentRows = (submenu: Extract<Submenu, { kind: "parent" }>, deps: RowDeps, data: SubmenuData): PaletteRow[] => {
	const { action, selection } = deps;
	const tickets = submenu.tickets;
	const none: PaletteRow = {
		value: "parent.none",
		label: "No parent",
		icon: <ArrowBendUpLeft />,
		run: writeTickets(
			deps,
			submenu,
			() => void setParent(action, tickets[0]!, null),
			() => void bulk.setParent(deps.bulk, selection, null),
		),
	};
	const rows = data.tickets
		.filter((ticket) => !tickets.includes(ticket.identifier))
		.map((ticket) => ({
			value: `parent.${ticket.identifier}`,
			label: ticket.title,
			sub: ticket.identifier,
			mono: true,
			run: writeTickets(
				deps,
				submenu,
				() => void setParent(action, tickets[0]!, ticket.identifier),
				() => void bulk.setParent(deps.bulk, selection, ticket),
			),
		}));
	return [none, ...rows];
};

const epicRows = (submenu: Extract<Submenu, { kind: "epic" }>, deps: RowDeps, data: SubmenuData): PaletteRow[] => {
	const { action, selection } = deps;
	const tickets = submenu.tickets;
	const none: PaletteRow = {
		value: "epic.none",
		label: "No epic",
		icon: <Stack />,
		run: writeTickets(
			deps,
			submenu,
			() => void setEpic(action, tickets[0]!, null),
			() => void bulk.setEpic(deps.bulk, selection, null),
		),
	};
	const rows = data.epics.map((epic) => ({
		value: `epic.${epic.ref}`,
		label: epic.name,
		sub: epic.state === "done" ? "Done" : undefined,
		keywords: [epic.ref, epic.slug],
		icon: <Stack />,
		run: writeTickets(
			deps,
			submenu,
			() => void setEpic(action, tickets[0]!, epic.ref),
			() => void bulk.setEpic(deps.bulk, selection, epic),
		),
	}));
	return [none, ...rows];
};

// Only the Selection section opens this submenu, so every pick writes
// through the bulk path.
const waveRows = (deps: RowDeps, data: SubmenuData): PaletteRow[] => {
	const pick = (wave: WaveSummary | null) => () => {
		deps.close();
		void bulk.setWave(deps.bulk, deps.selection, wave);
	};
	const none: PaletteRow = { value: "wave.none", label: "No wave", icon: <Flag />, run: pick(null) };
	const rows = data.waves.map((wave) => ({
		value: `wave.${wave.ref}`,
		label: wave.name,
		sub: wave.state === "done" ? "Done" : undefined,
		keywords: [wave.ref, wave.slug],
		icon: <Flag />,
		run: pick(wave),
	}));
	return [none, ...rows];
};
