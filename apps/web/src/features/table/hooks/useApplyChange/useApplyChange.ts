import type { LabelGroup, StatusSummary, TicketSummary } from "@trellis/api";
import { useStableCallback } from "../../../../hooks/useStableCallback";

import { priorityLabels } from "../../../pickers/PriorityPicker";
import { toggleLabel } from "../../../pickers/utils/toggleLabel";
import type { RowChange } from "../../Row";
import type { BulkWrite } from "../useBulkWrite";
import type { useTicketMutations, Verb } from "../useTicketMutations";

type Mutations = ReturnType<typeof useTicketMutations>;

const summaryOf = (status: StatusSummary): StatusSummary => ({
	id: status.id,
	slug: status.slug,
	name: status.name,
	category: status.category,
	color: status.color,
});

// Where the rows of a change come from. "selection" is the bulk bar or a
// key over the selected rows. "row" is an edit of the one row the person
// works in, which no selection holds.
export type ChangeSource = "selection" | "row";

// Applies one inline or bulk change to the target rows. A change from the
// selection writes through `bulk.update`, which asks before a large write,
// sends the refs in runs of 200, and reports the tickets it left out. A
// change from one row writes through `mutations.update`, which sends the
// version of that row.
//
// `words` names the change for the confirm dialog, as in "Set the status to
// Done". `groups` names the label groups of the route, which decide the
// label a new label of a group replaces. The callback identity is stable
// across renders.
export const useApplyChange = (mutations: Mutations, bulk: BulkWrite, groups: readonly LabelGroup[]) =>
	useStableCallback((targets: readonly TicketSummary[], change: RowChange, source: ChangeSource) => {
		if (targets.length === 0) return;
		const many = source === "selection";
		if ("status" in change) {
			const status = summaryOf(change.status);
			const verb: Verb = (subject) => `${subject} did not move to ${status.name}.`;
			return many
				? bulk.update(targets, { status: status.id }, `Set the status to ${status.name}`, { row: { status }, verb })
				: mutations.update(targets[0]!, { status: status.id }, { status }, verb);
		}
		if ("priority" in change) {
			const name = priorityLabels[change.priority];
			const verb: Verb = (subject) => `The priority of ${subject} did not change to ${name}.`;
			const patch = { priority: change.priority };
			return many
				? bulk.update(targets, patch, `Set the priority to ${name}`, { row: patch, verb })
				: mutations.update(targets[0]!, patch, patch, verb);
		}
		if ("label" in change) {
			const { label, checked } = change;
			// A label write sends the one label it changes, never the whole set,
			// so two writers do not overwrite the labels of each other.
			const fields = checked ? { addLabels: [label.id] } : { removeLabels: [label.id] };
			const row = (ticket: TicketSummary) => ({ labels: toggleLabel(ticket.labels, label, groups, checked) });
			const verb: Verb = (subject) => `The labels of ${subject} did not change.`;
			const words = checked ? `Add the label ${label.name}` : `Remove the label ${label.name}`;
			return many
				? bulk.update(targets, fields, words, { row, verb })
				: mutations.update(targets[0]!, fields, row, verb, { expectVersion: false });
		}
		if ("parent" in change) {
			const parent = change.parent === null ? null : { id: change.parent.id, identifier: change.parent.identifier };
			const verb: Verb = (subject) => `The parent of ${subject} did not change.`;
			const words = parent === null ? "Clear the parent" : `Set the parent to ${parent.identifier}`;
			const fields = { parent: parent?.identifier ?? null };
			return many
				? bulk.update(targets, fields, words, { row: { parent }, verb })
				: mutations.update(targets[0]!, fields, { parent }, verb);
		}
		if ("wave" in change) {
			const { wave: picked } = change;
			const wave = picked === null ? null : { id: picked.id, ref: picked.ref, name: picked.name };
			const verb: Verb = (subject) => `The wave of ${subject} did not change.`;
			const words = wave === null ? "Clear the wave" : `Set the wave to ${wave.name}`;
			const fields = { wave: wave?.ref ?? null };
			return many
				? bulk.update(targets, fields, words, { row: { wave }, verb })
				: mutations.update(targets[0]!, fields, { wave }, verb);
		}
		const epic = change.epic === null ? null : { id: change.epic.id, ref: change.epic.ref, name: change.epic.name };
		// A wave belongs to one epic, so the server clears the wave of
		// a ticket that leaves its epic. The patch does the same on the row.
		const patch = (row: TicketSummary) => ({ epic, wave: row.epic?.id === epic?.id ? row.wave : null });
		const verb: Verb = (subject) => `The epic of ${subject} did not change.`;
		const words = epic === null ? "Clear the epic" : `Set the epic to ${epic.name}`;
		const fields = { epic: epic?.ref ?? null };
		return many
			? bulk.update(targets, fields, words, { row: patch, verb })
			: mutations.update(targets[0]!, fields, patch, verb);
	});
