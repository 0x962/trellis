import type { Label, LabelGroup } from "@trellis/api";

// One line of the labels list. A label with no group and a group stand at the
// same level, and `labels` holds the labels of one group.
export type LabelEntry = { kind: "label"; label: Label } | { kind: "group"; group: LabelGroup; labels: Label[] };

const nameOf = (entry: LabelEntry) => (entry.kind === "label" ? entry.label.name : entry.group.name);

const byName = (left: string, right: string) => left.toLowerCase().localeCompare(right.toLowerCase());

const holds = (name: string, text: string) => name.toLowerCase().includes(text);

// The list the labels settings page draws, in name order without regard to
// case. A group whose own name holds the search text keeps every label of the
// group. A group whose name does not hold the text stays when one of its
// labels holds the text, and then it shows those labels only. An empty
// `search` keeps every label and every group.
export const labelEntries = (labels: readonly Label[], groups: readonly LabelGroup[], search: string): LabelEntry[] => {
	const text = search.trim().toLowerCase();
	const entries: LabelEntry[] = labels
		.filter((label) => label.groupId === null && (text === "" || holds(label.name, text)))
		.map((label) => ({ kind: "label", label }));
	for (const group of groups) {
		const held = labels.filter((label) => label.groupId === group.id);
		const groupHolds = text === "" || holds(group.name, text);
		const kept = groupHolds ? held : held.filter((label) => holds(label.name, text));
		if (kept.length === 0 && !groupHolds) continue;
		entries.push({ kind: "group", group, labels: kept.sort((left, right) => byName(left.name, right.name)) });
	}
	return entries.sort((left, right) => byName(nameOf(left), nameOf(right)));
};
