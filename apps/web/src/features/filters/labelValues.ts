import { Tag } from "@phosphor-icons/react";
import type { Label, LabelColor, LabelGroup } from "@trellis/api";
import type { CommandGroup } from "@trellis/ui";
import { LabelDot } from "@trellis/ui";
import { createElement } from "react";

// One label of the scope, with the ref the URL carries for it. `ref` is the
// canonical label ref: the lower-case name of a label with no group, and
// `group/name` in lower case for a label of a group.
export type FilterLabel = {
	id: string;
	ref: string;
	name: string;
	color: LabelColor;
	// The name of the label group, or null for a label with no group.
	group: string | null;
};

// The URL value that keeps the tickets with no label at all.
export const noLabelValue = "none";

const byGroupThenName = (a: FilterLabel, b: FilterLabel) =>
	(a.group ?? "").toLowerCase().localeCompare((b.group ?? "").toLowerCase()) ||
	a.name.toLowerCase().localeCompare(b.name.toLowerCase());

// The filter rows of a label list: the labels with no group first, then the
// labels of each group in group-name order. Every grouped label carries its
// `group/name` ref, so two groups that hold one name stay two rows.
export const filterLabels = (labels: readonly Label[], groups: readonly LabelGroup[]): FilterLabel[] => {
	const groupNames = new Map(groups.map((group) => [group.id, group.name]));
	return labels
		.map((label) => {
			const group = label.groupId === null ? null : (groupNames.get(label.groupId) ?? null);
			const name = label.name.toLowerCase();
			return {
				id: label.id,
				ref: group === null ? name : `${group.toLowerCase()}/${name}`,
				name: label.name,
				color: label.color,
				group,
			};
		})
		.sort(byGroupThenName);
};

// The name a chip prints for one label. A label of a group prints its group
// first, as its pill does, so two groups that hold one name read apart.
export const filterLabelName = (label: FilterLabel) =>
	label.group === null ? label.name : `${label.group} / ${label.name}`;

// The value rows of the Label filter: the "No label" row and the labels with
// no group in one headed-less section, then one section per label group.
export const labelValueGroups = (labels: readonly FilterLabel[], checked: readonly string[]): CommandGroup[] => {
	const row = (label: FilterLabel) => ({
		id: label.ref,
		label: label.name,
		keywords: label.group === null ? undefined : [label.group, filterLabelName(label)],
		icon: createElement(LabelDot, { color: label.color, variant: "icon" as const }),
		checked: checked.includes(label.ref),
	});
	const first: CommandGroup = {
		items: [
			{
				id: noLabelValue,
				label: "No label",
				icon: createElement(Tag),
				checked: checked.includes(noLabelValue),
			},
			...labels.filter((label) => label.group === null).map(row),
		],
	};
	const named = [...new Set(labels.filter((label) => label.group !== null).map((label) => label.group!))].map(
		(group) => ({
			heading: group,
			items: labels.filter((label) => label.group === group).map(row),
		}),
	);
	return [first, ...named];
};
