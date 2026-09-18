import { Plus } from "@phosphor-icons/react";
import { type Label, type LabelGroup, LabelNameSchema } from "@trellis/api";
import { type CommandGroup, type CommandItem, LabelDot } from "@trellis/ui";
import { createElement } from "react";

// The id prefix of the row that creates a label from the search text. The id
// is the prefix, a colon, and the text: cmdk keeps the keywords it saw when a
// row first mounted for as long as the row keeps its id, so a fixed id would
// filter against the first letter typed. A label row carries a ULID, which
// holds no colon, so no label row can carry a create id.
export const createRowId = "create-label";
export const createRowIdFor = (name: string) => `${createRowId}:${name}`;
export const isCreateRow = (id: string) => id.startsWith(`${createRowId}:`);

export type LabelRowsOptions = {
	// The ids of the labels that the rows draw with a check.
	checked: readonly string[];
	// The text in the search field. It becomes the name of a new label.
	search: string;
};

// The rows of the label picker: `items` holds the labels with no group, and
// `groups` holds one Command group per label group, then the create row.
export type LabelRows = {
	items: CommandItem[];
	groups: CommandGroup[];
};

const byName = (a: { name: string }, b: { name: string }) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());

// cmdk matches a row against its id and its keywords. The group name and the
// `group/name` form are keywords, so a search for the group finds its labels.
const labelRow = (label: Label, group: string | null, checked: readonly string[]): CommandItem => ({
	id: label.id,
	label: label.name,
	keywords: group === null ? [] : [group, `${group}/${label.name}`],
	icon: createElement(LabelDot, { color: label.color, variant: "icon" }),
	checked: checked.includes(label.id),
});

// The create row appears while the text names a label that the tree does not
// hold yet. `LabelNameSchema` states the names the server accepts, so a text
// that the server refuses, such as "type/bug", grows no row.
const offersCreate = (labels: readonly Label[], name: string) =>
	name !== "" &&
	LabelNameSchema.safeParse(name).success &&
	!labels.some((label) => label.name.toLowerCase() === name.toLowerCase());

// The rows of the label picker in display order: the labels with no group
// first, then one group per label group, each in name order. cmdk hides a row
// whose id and keywords do not match the search text, so the create row
// carries that text as a keyword and stays visible while the user types.
export const labelRows = (
	labels: readonly Label[],
	groups: readonly LabelGroup[],
	{ checked, search }: LabelRowsOptions,
): LabelRows => {
	const name = search.trim();
	const items = labels
		.filter((label) => label.groupId === null)
		.sort(byName)
		.map((label) => labelRow(label, null, checked));
	const sections: CommandGroup[] = [...groups]
		.sort(byName)
		.map((group) => ({
			heading: group.name,
			items: labels
				.filter((label) => label.groupId === group.id)
				.sort(byName)
				.map((label) => labelRow(label, group.name, checked)),
		}))
		.filter((section) => section.items.length > 0);
	if (offersCreate(labels, name)) {
		sections.push({
			items: [
				{
					id: createRowIdFor(name),
					label: `Create label "${name}"`,
					keywords: [name],
					icon: createElement(Plus),
				},
			],
		});
	}
	return { items, groups: sections };
};
