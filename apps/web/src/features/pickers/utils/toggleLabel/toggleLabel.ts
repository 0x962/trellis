import type { Label, LabelGroup, TicketLabel } from "@trellis/api";

// The order of the labels on a ticket: labels with no group first, then by
// group name, then by label name. The server orders `TicketSummary.labels`
// the same way, so an optimistic row and the server row match.
const byGroupThenName = (a: TicketLabel, b: TicketLabel) =>
	(a.group ?? "").toLowerCase().localeCompare((b.group ?? "").toLowerCase()) ||
	a.name.toLowerCase().localeCompare(b.name.toLowerCase());

// The labels of a ticket after one picker row changes. A ticket holds one
// label of a group at most, so a new label of a group removes the other
// label of that group.
export const toggleLabel = (
	current: readonly TicketLabel[],
	label: Label,
	groups: readonly LabelGroup[],
	checked: boolean,
): TicketLabel[] => {
	if (!checked) return current.filter((held) => held.id !== label.id);
	const group = groups.find((candidate) => candidate.id === label.groupId)?.name ?? null;
	const kept = current.filter((held) => held.id !== label.id && (group === null || held.group !== group));
	return [...kept, { id: label.id, name: label.name, color: label.color, group }].sort(byGroupThenName);
};
