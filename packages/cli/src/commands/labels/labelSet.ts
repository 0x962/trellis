import type { Label, LabelGroup, LabelListOutput, LabelRef } from "@trellis/api";
import { LabelGroupRefSchema, LabelRefSchema } from "@trellis/api";
import { labelAmbiguous, notFound, usageError } from "../../errors.ts";
import { cell, type ListSpec, labelText, type RecordSpec } from "../../output.ts";

// A label with the name of its group beside it. `labels.list` answers the
// group id on the label and the name on the group row, and every printed
// label carries the name. `group` is null for a label with no group.
export type LabelRow = Label & { group: string | null };

export const groupNameOf = (groups: LabelGroup[], groupId: string | null): string | null =>
	groupId === null ? null : groups.find((group) => group.id === groupId)!.name;

export const rowsOf = (set: LabelListOutput): LabelRow[] =>
	set.labels.map((label) => ({ ...label, group: groupNameOf(set.groups, label.groupId) }));

// The first zod sentence of a ref the grammar refuses. A ref comes from the
// command line, so the person reads the sentence and writes the ref again.
const grammarError = (issues: Array<{ message: string }>) => usageError(issues[0]!.message);

// The label a ref names, or undefined when the set holds no such label. A
// ULID names the label with that id. `group/name` names the label of that
// group. A bare name takes the label with no group first, the way the server
// resolves it. When every label of that name sits in a group, and two or more
// groups hold the name, the ref names no single label. The run then stops and
// prints every `group/name` form.
const find = (set: LabelListOutput, ref: LabelRef): Label | undefined => {
	if (ref.kind === "ulid") return set.labels.find((label) => label.id === ref.id);
	const { group: groupName, name } = ref;
	const named = set.labels.filter((label) => label.name.toLowerCase() === name);
	if (groupName !== null) {
		const group = set.groups.find((candidate) => candidate.name.toLowerCase() === groupName);
		return group === undefined ? undefined : named.find((label) => label.groupId === group.id);
	}
	const ungrouped = named.find((label) => label.groupId === null);
	if (ungrouped !== undefined) return ungrouped;
	if (named.length > 1) {
		const forms = named.map((label) => labelText({ name: label.name, group: groupNameOf(set.groups, label.groupId) }));
		throw labelAmbiguous(forms);
	}
	return named[0];
};

export const labelOf = (set: LabelListOutput, ref: string): Label => {
	const parsed = LabelRefSchema.safeParse(ref);
	if (!parsed.success) throw grammarError(parsed.error.issues);
	const label = find(set, parsed.data);
	if (label === undefined) throw notFound("label", ref);
	return label;
};

export const groupOf = (set: LabelListOutput, ref: string): LabelGroup => {
	const parsed = LabelGroupRefSchema.safeParse(ref);
	if (!parsed.success) throw grammarError(parsed.error.issues);
	const value = parsed.data;
	const group = set.groups.find((candidate) =>
		value.kind === "ulid" ? candidate.id === value.id : candidate.name.toLowerCase() === value.name,
	);
	if (group === undefined) throw notFound("label group", ref);
	return group;
};

export const labelList: ListSpec<LabelRow> = {
	columns: [
		{ name: "label", value: labelText },
		{ name: "color", value: (row) => row.color },
		{ name: "tickets", value: (row) => String(row.ticketCount) },
		{ name: "description", value: (row) => cell(row.description) },
	],
	identifier: labelText,
};

export const labelRecord: RecordSpec<LabelRow> = {
	fields: [
		{ name: "label", value: labelText },
		{ name: "id", value: (row) => row.id },
		{ name: "name", value: (row) => row.name },
		{ name: "group", value: (row) => cell(row.group) },
		{ name: "color", value: (row) => row.color },
		{ name: "tickets", value: (row) => String(row.ticketCount) },
		{ name: "description", value: (row) => cell(row.description) },
	],
	identifier: labelText,
};

export const groupRecord: RecordSpec<LabelGroup> = {
	fields: [
		{ name: "name", value: (row) => row.name },
		{ name: "id", value: (row) => row.id },
	],
	identifier: (row) => row.name,
};
