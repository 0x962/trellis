import type {
	EpicSummary,
	Label,
	LabelGroup,
	MilestoneSummary,
	Priority,
	ProjectSummary,
	Status,
	TicketSummary,
} from "@trellis/api";
import { projectSlashPath } from "../../../../lib/projectPath";
import { toggleLabel } from "../../../pickers/utils/toggleLabel";
import type { BulkWrite } from "../../../table/hooks/useBulkWrite";
import { priorityLabels } from "../../rows";

// Every write the palette Selection section makes. Each function sends one
// field through `bulk.update`, which splits the rows into runs of 200, asks
// the person before a large write, puts the new value in the cached rows
// before the request leaves, and puts the old value back on a failure. The
// bulk bar of the table writes through the same hook, so both surfaces
// behave the same way.
//
// The third argument of `bulk.update` names the action in the question the
// confirm dialog asks, as in "Set the status to Done".

export const setStatus = (bulk: BulkWrite, rows: readonly TicketSummary[], status: Status): Promise<void> =>
	bulk.update(rows, { status: status.id }, `Set the status to ${status.name}`, {
		row: {
			status: {
				id: status.id,
				slug: status.slug,
				name: status.name,
				category: status.category,
				reviewer: status.reviewer,
				color: status.color,
			},
		},
		verb: (subject) => `${subject} did not move to ${status.name}.`,
	});

export const setPriority = (bulk: BulkWrite, rows: readonly TicketSummary[], priority: Priority): Promise<void> =>
	bulk.update(rows, { priority }, `Set the priority to ${priorityLabels[priority]}`, {
		row: { priority },
		verb: (subject) => `The priority of ${subject} did not change to ${priorityLabels[priority]}.`,
	});

export const moveToProject = (
	bulk: BulkWrite,
	rows: readonly TicketSummary[],
	project: ProjectSummary,
): Promise<void> => {
	const path = projectSlashPath(project.path);
	return bulk.update(rows, { project: project.path }, `Move to ${path}`, {
		row: { project: { id: project.id, key: project.key, path: project.path } },
		verb: (subject) => `${subject} did not move to ${path}.`,
	});
};

export const setParent = (
	bulk: BulkWrite,
	rows: readonly TicketSummary[],
	parent: TicketSummary | null,
): Promise<void> =>
	bulk.update(
		rows,
		{ parent: parent === null ? null : parent.identifier },
		parent === null ? "Clear the parent" : `Set the parent to ${parent.identifier}`,
		{
			row: { parent: parent === null ? null : { id: parent.id, identifier: parent.identifier } },
			verb: (subject) => `The parent of ${subject} did not change.`,
		},
	);

export const setEpic = (bulk: BulkWrite, rows: readonly TicketSummary[], epic: EpicSummary | null): Promise<void> =>
	bulk.update(
		rows,
		{ epic: epic === null ? null : epic.ref },
		epic === null ? "Clear the epic" : `Set the epic to ${epic.name}`,
		{
			// A milestone belongs to one epic, so the server clears the milestone
			// of a ticket that leaves its epic. The patch does the same on the row.
			row: (row: TicketSummary) => ({
				epic: epic === null ? null : { id: epic.id, ref: epic.ref, name: epic.name },
				milestone: row.epic?.id === epic?.id ? row.milestone : null,
			}),
			verb: (subject) => `The epic of ${subject} did not change.`,
		},
	);

// Every row belongs to the epic of `milestone`, because the Selection
// section offers the milestones of the one epic the rows share.
export const setMilestone = (
	bulk: BulkWrite,
	rows: readonly TicketSummary[],
	milestone: MilestoneSummary | null,
): Promise<void> =>
	bulk.update(
		rows,
		{ milestone: milestone === null ? null : milestone.ref },
		milestone === null ? "Clear the milestone" : `Set the milestone to ${milestone.name}`,
		{
			row: { milestone: milestone === null ? null : { id: milestone.id, ref: milestone.ref, name: milestone.name } },
			verb: (subject) => `The milestone of ${subject} did not change.`,
		},
	);

// `on` is the state the label takes on every row. The write sends the one
// label it changes, so two people who change two labels do not overwrite
// each other.
export const setLabel = (
	bulk: BulkWrite,
	rows: readonly TicketSummary[],
	label: Label,
	groups: readonly LabelGroup[],
	on: boolean,
): Promise<void> =>
	bulk.update(
		rows,
		on ? { addLabels: [label.id] } : { removeLabels: [label.id] },
		on ? `Add the label ${label.name}` : `Remove the label ${label.name}`,
		{
			row: (row: TicketSummary) => ({ labels: toggleLabel(row.labels, label, groups, on) }),
			verb: (subject) => `The labels of ${subject} did not change.`,
		},
	);
