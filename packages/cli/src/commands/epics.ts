import type { Epic, EpicSummary } from "@trellis/api";
import { shortZonedDateTime } from "@trellis/api/time";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, readText } from "../context.ts";
import {
	cell,
	heading,
	json,
	type ListSpec,
	printList,
	printRecord,
	type RecordSpec,
	renderRecord,
	renderTable,
	ticketList,
} from "../output.ts";

const epicArg = {
	type: "positional" as const,
	required: true as const,
	description: "Epic ref, such as OP/routine-runtime",
};
const projectArg = { type: "string" as const, required: true as const, description: "Project ref, such as OP" };

// An agent actor is `agent:<run id>`. Its display name comes first.
const writer = (epic: EpicSummary) =>
	epic.actor.kind === "agent" && epic.actor.displayName !== undefined
		? `${epic.actor.kind}:${epic.actor.displayName} ${epic.actor.name}`
		: `${epic.actor.kind}:${epic.actor.name}`;

// A canceled ticket is never done and never counts in the denominator.
const progress = (epic: EpicSummary) => `${epic.counts.done}/${epic.counts.total - epic.counts.canceled} done`;

const epicList: ListSpec<EpicSummary> = {
	columns: [
		{ name: "ref", value: (row) => row.ref },
		{ name: "state", value: (row) => row.state },
		{ name: "progress", value: progress },
		{ name: "name", value: (row) => cell(row.name) },
		{ name: "project", value: (row) => row.projectPath },
		{ name: "updated", value: (row) => shortZonedDateTime(row.updatedAt) },
	],
	identifier: (row) => row.ref,
};

// The description is not a field: it has many lines, so `show` prints it
// below the block.
const epicRecord: RecordSpec<EpicSummary> = {
	fields: [
		{ name: "ref", value: (row) => row.ref },
		{ name: "id", value: (row) => row.id },
		{ name: "name", value: (row) => cell(row.name) },
		{ name: "slug", value: (row) => row.slug },
		{ name: "project", value: (row) => row.projectPath },
		{ name: "state", value: (row) => row.state },
		{ name: "progress", value: progress },
		{
			name: "counts",
			value: (row) =>
				`todo ${row.counts.todo}, started ${row.counts.started}, review ${row.counts.review}, done ${row.counts.done}, canceled ${row.counts.canceled}`,
		},
		{ name: "actor", value: writer },
		{ name: "created", value: (row) => shortZonedDateTime(row.createdAt) },
		{ name: "updated", value: (row) => shortZonedDateTime(row.updatedAt) },
	],
	identifier: (row) => row.ref,
};

const deletedRecord: RecordSpec<{ id: string }> = {
	fields: [{ name: "deleted", value: (row) => row.id }],
	identifier: (row) => row.id,
};

const list = defineCommand({
	meta: { name: "list", description: "List the epics of a project and its sub-projects, open first" },
	args: { project: projectArg },
	async run(context) {
		const ctx = contextOf(context);
		const epics = await clientOf(ctx).epics.list({ project: context.args.project });
		printList(ctx.out, ctx.format, epics, epicList);
	},
});

// The record block, the description, then the tickets in number order.
const renderEpic = (epic: Epic, color: boolean): string => {
	const block = renderRecord(epic, epicRecord.fields);
	const description = epic.description === "" ? "" : `\n${epic.description}\n`;
	const tickets = `\n${heading("tickets", color)}${renderTable(epic.tickets, ticketList.columns)}`;
	return `${block}${description}${tickets}`;
};

const show = defineCommand({
	meta: { name: "show", description: "Show one epic and its tickets" },
	args: { epic: epicArg },
	async run(context) {
		const ctx = contextOf(context);
		const epic = await clientOf(ctx).epics.get({ epic: context.args.epic });
		const { mode, color } = ctx.format;
		if (mode === "quiet") {
			ctx.out.write(`${epic.ref}\n`);
			return;
		}
		if (mode === "json" || mode === "jsonl") {
			ctx.out.write(json(epic));
			return;
		}
		ctx.out.write(renderEpic(epic, color));
	},
});

const create = defineCommand({
	meta: { name: "create", description: "Create an epic in a project" },
	args: {
		project: projectArg,
		name: { type: "string", required: true, description: "Name, 1 to 120 characters" },
		slug: { type: "string", description: "Slug, unique in the root project; derives from the name when absent" },
		description: { type: "string", description: "Markdown plan, or - for stdin" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const epic = await clientOf(ctx).epics.create(
			compact({
				project: args.project,
				name: args.name,
				slug: args.slug,
				description: args.description === undefined ? undefined : await readText(ctx, args.description),
			}),
		);
		printRecord(ctx.out, ctx.format, epic, epicRecord);
	},
});

const edit = defineCommand({
	meta: { name: "edit", description: "Change the fields of an epic that you pass" },
	args: {
		epic: epicArg,
		name: { type: "string", description: "New name" },
		slug: { type: "string", description: "New slug" },
		description: { type: "string", description: "New markdown plan, or - for stdin" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const epic = await clientOf(ctx).epics.update(
			compact({
				epic: args.epic,
				name: args.name,
				slug: args.slug,
				description: args.description === undefined ? undefined : await readText(ctx, args.description),
			}),
		);
		printRecord(ctx.out, ctx.format, epic, epicRecord);
	},
});

const add = defineCommand({
	meta: { name: "add", description: "Put tickets in an epic" },
	args: {
		epic: epicArg,
		tickets: { type: "positional", required: true, description: "Ticket refs, such as OP-29 OP-30" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		// citty keeps every positional in `_`, so the ticket refs follow the epic ref.
		const result = await clientOf(ctx).tickets.updateMany({ tickets: args._.slice(1), epic: args.epic });
		printList(ctx.out, ctx.format, result.items, ticketList);
	},
});

const remove = defineCommand({
	meta: { name: "remove", description: "Take tickets out of their epic" },
	args: {
		tickets: { type: "positional", required: true, description: "Ticket refs, such as OP-29 OP-30" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).tickets.updateMany({ tickets: context.args._, epic: null });
		printList(ctx.out, ctx.format, result.items, ticketList);
	},
});

const del = defineCommand({
	meta: { name: "delete", description: "Delete an epic and detach its tickets" },
	args: {
		epic: epicArg,
		force: { type: "boolean", description: "Let an agent delete" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const result = await clientOf(ctx).epics.delete(
			compact({ epic: args.epic, force: args.force === true ? true : undefined }),
		);
		printRecord(ctx.out, ctx.format, result, deletedRecord);
	},
});

export default defineCommand({
	meta: { name: "epics", description: "List, show, create, edit, fill, or delete the epics of a project" },
	subCommands: { list, show, create, edit, add, remove, delete: del },
});
