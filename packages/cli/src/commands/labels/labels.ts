import type { Label, LabelColor, LabelGroup } from "@trellis/api";
import { LabelColorSchema } from "@trellis/api";
import { type ArgDef, defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { type CliContext, compact, contextOf } from "../../context.ts";
import { usageError } from "../../errors.ts";
import { hasFlag, repeatedFlag } from "../../flags.ts";
import { json, printList, printRecord } from "../../output.ts";
import { groupNameOf, groupOf, groupRecord, labelList, labelOf, labelRecord, rowsOf } from "./labelSet.ts";

const project = { type: "positional", required: true, description: "Project ref" } as const;

const colorFlag = {
	type: "enum",
	options: [...LabelColorSchema.options],
	description: "Label color; the server picks an unused hue when absent",
} satisfies ArgDef;

const descriptionFlag = { type: "string", description: "What the label means, 255 characters or less" } as const;

// One label, after a create or an update. `--json` and `--jsonl` print the
// procedure output, which names the group by its id and not by its name. A
// table and a quiet line print the `group/name` ref, so they read the name
// out of the group list.
const printLabel = (ctx: CliContext, label: Label, groups: LabelGroup[]): void => {
	if (ctx.format.mode === "json" || ctx.format.mode === "jsonl") {
		ctx.out.write(json(label));
		return;
	}
	printRecord(ctx.out, ctx.format, { ...label, group: groupNameOf(groups, label.groupId) }, labelRecord);
};

const list = defineCommand({
	meta: { name: "list", description: "List the labels of a project tree" },
	args: { project },
	async run(context) {
		const ctx = contextOf(context);
		const set = await clientOf(ctx).labels.list({ project: context.args.project });
		// `json` is the procedure output, which carries the groups beside the
		// labels. Every other mode prints one label per row.
		if (ctx.format.mode === "json") {
			ctx.out.write(json(set));
			return;
		}
		printList(ctx.out, ctx.format, rowsOf(set), labelList);
	},
});

const add = defineCommand({
	meta: { name: "add", description: "Add a label" },
	args: {
		project,
		name: { type: "positional", required: true, description: "Name" },
		group: { type: "string", description: "Group ref; the label has no group when absent" },
		color: colorFlag,
		description: descriptionFlag,
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const client = clientOf(ctx);
		const label = await client.labels.create(
			compact({
				project: args.project,
				name: args.name,
				group: args.group,
				color: args.color as LabelColor | undefined,
				description: args.description,
			}),
		);
		const groups = label.groupId === null ? [] : (await client.labels.list({ project: args.project })).groups;
		printLabel(ctx, label, groups);
	},
});

const edit = defineCommand({
	meta: { name: "edit", description: "Change label fields" },
	args: {
		project,
		label: { type: "positional", required: true, description: "Label ref: a ULID, a name, or group/name" },
		name: { type: "string", description: "New name" },
		group: { type: "string", description: "Group ref that takes the label" },
		"no-group": { type: "boolean", description: "Take the label out of its group" },
		color: colorFlag,
		description: descriptionFlag,
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		// citty reads `--no-group` as the flag `group` set to false. That hides
		// the text of a `--group` on the same line, so this command reads both
		// flags from the raw arguments. The last `--group` wins, the way citty
		// reads a repeated flag.
		const clears = hasFlag(context.rawArgs, "no-group");
		const group = repeatedFlag(context.rawArgs, "group").at(-1);
		if (clears && group !== undefined) throw usageError("pass --group or --no-group, not both");
		const client = clientOf(ctx);
		const set = await client.labels.list({ project: args.project });
		const label = await client.labels.update(
			compact({
				project: args.project,
				label: labelOf(set, args.label).id,
				name: args.name,
				group: clears ? null : group,
				color: args.color as LabelColor | undefined,
				description: args.description,
			}),
		);
		// The group list is read again: the update may have put the label in a
		// group that another client created after the first read.
		const groups = label.groupId === null ? [] : (await client.labels.list({ project: args.project })).groups;
		printLabel(ctx, label, groups);
	},
});

const rm = defineCommand({
	meta: { name: "rm", description: "Delete a label and take it off every ticket" },
	args: {
		project,
		label: { type: "positional", required: true, description: "Label ref: a ULID, a name, or group/name" },
		force: { type: "boolean", description: "Let an agent delete" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const client = clientOf(ctx);
		const set = await client.labels.list({ project: args.project });
		const result = await client.labels.delete(
			compact({
				project: args.project,
				label: labelOf(set, args.label).id,
				force: args.force === true ? true : undefined,
			}),
		);
		printRecord(ctx.out, ctx.format, result, {
			fields: [
				{ name: "deleted", value: (row) => row.deleted },
				{ name: "tickets", value: (row) => String(row.tickets) },
			],
			identifier: (row) => row.deleted,
		});
	},
});

const groupAdd = defineCommand({
	meta: { name: "group-add", description: "Add a label group" },
	args: { project, name: { type: "positional", required: true, description: "Name" } },
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const group = await clientOf(ctx).labelGroups.create({ project: args.project, name: args.name });
		printRecord(ctx.out, ctx.format, group, groupRecord);
	},
});

const groupEdit = defineCommand({
	meta: { name: "group-edit", description: "Rename a label group" },
	args: {
		project,
		group: { type: "positional", required: true, description: "Group ref: a ULID or a name" },
		name: { type: "string", required: true, description: "New name" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const client = clientOf(ctx);
		const set = await client.labels.list({ project: args.project });
		const group = await client.labelGroups.update({
			project: args.project,
			group: groupOf(set, args.group).id,
			name: args.name,
		});
		printRecord(ctx.out, ctx.format, group, groupRecord);
	},
});

const groupRm = defineCommand({
	meta: { name: "group-rm", description: "Delete a label group" },
	args: {
		project,
		group: { type: "positional", required: true, description: "Group ref: a ULID or a name" },
		labels: {
			type: "enum",
			options: ["ungroup", "delete"],
			required: true,
			description: "What happens to the labels of the group",
		},
		force: { type: "boolean", description: "Let an agent delete" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		// citty checks the value of an enum flag, and it does not check that a
		// required one is on the command line.
		if (repeatedFlag(context.rawArgs, "labels").length === 0)
			throw usageError("group-rm needs --labels ungroup or --labels delete");
		const client = clientOf(ctx);
		const set = await client.labels.list({ project: args.project });
		const result = await client.labelGroups.delete(
			compact({
				project: args.project,
				group: groupOf(set, args.group).id,
				labels: args.labels as "ungroup" | "delete",
				force: args.force === true ? true : undefined,
			}),
		);
		printRecord(ctx.out, ctx.format, result, {
			fields: [
				{ name: "deleted", value: (row) => row.deleted },
				{ name: "ungrouped", value: (row) => String(row.ungrouped) },
				{ name: "deletedLabels", value: (row) => String(row.deletedLabels) },
			],
			identifier: (row) => row.deleted,
		});
	},
});

export default defineCommand({
	meta: { name: "labels", description: "List, add, edit, or remove labels and label groups" },
	subCommands: { list, add, edit, rm, "group-add": groupAdd, "group-edit": groupEdit, "group-rm": groupRm },
});
