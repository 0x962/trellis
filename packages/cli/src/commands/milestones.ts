import type { EpicCounts, MilestoneSummary } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf } from "../context.ts";
import { cell, type ListSpec, printList, printRecord, type RecordSpec, ticketList } from "../output.ts";

const epicArg = {
	type: "positional" as const,
	required: true as const,
	description: "Epic ref, such as OP/routine-runtime",
};
const milestoneArg = {
	type: "positional" as const,
	required: true as const,
	description: "Milestone ref, such as OP/routine-runtime/phase-1",
};

// A canceled ticket is never done and never counts in the denominator.
export const progress = (row: { counts: EpicCounts }) =>
	`${row.counts.done}/${row.counts.total - row.counts.canceled} done`;

export const countsText = (row: { counts: EpicCounts }) =>
	`todo ${row.counts.todo}, started ${row.counts.started}, review ${row.counts.review}, done ${row.counts.done}, canceled ${row.counts.canceled}`;

// The rows arrive in position order, so the table prints no position column.
export const milestoneList: ListSpec<MilestoneSummary> = {
	columns: [
		{ name: "ref", value: (row) => row.ref },
		{ name: "state", value: (row) => row.state },
		{ name: "progress", value: progress },
		{ name: "counts", value: countsText },
		{ name: "name", value: (row) => cell(row.name) },
	],
	identifier: (row) => row.ref,
};

const milestoneRecord: RecordSpec<MilestoneSummary> = {
	fields: [
		{ name: "ref", value: (row) => row.ref },
		{ name: "id", value: (row) => row.id },
		{ name: "name", value: (row) => cell(row.name) },
		{ name: "slug", value: (row) => row.slug },
		{ name: "position", value: (row) => String(row.position) },
		{ name: "state", value: (row) => row.state },
		{ name: "progress", value: progress },
		{ name: "counts", value: countsText },
	],
	identifier: (row) => row.ref,
};

const deletedRecord: RecordSpec<{ id: string }> = {
	fields: [{ name: "deleted", value: (row) => row.id }],
	identifier: (row) => row.id,
};

const list = defineCommand({
	meta: { name: "list", description: "List the milestones of an epic in their order" },
	args: { epic: epicArg },
	async run(context) {
		const ctx = contextOf(context);
		const epic = await clientOf(ctx).epics.get({ epic: context.args.epic });
		printList(ctx.out, ctx.format, epic.milestones, milestoneList);
	},
});

const create = defineCommand({
	meta: { name: "create", description: "Add a milestone at the end of an epic" },
	args: {
		epic: epicArg,
		name: { type: "string", required: true, description: "Name, 1 to 120 characters" },
		slug: { type: "string", description: "Slug, unique in the epic; derives from the name when absent" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const milestone = await clientOf(ctx).milestones.create(
			compact({ epic: args.epic, name: args.name, slug: args.slug }),
		);
		printRecord(ctx.out, ctx.format, milestone, milestoneRecord);
	},
});

const edit = defineCommand({
	meta: { name: "edit", description: "Change the fields of a milestone that you pass" },
	args: {
		milestone: milestoneArg,
		name: { type: "string", description: "New name" },
		slug: { type: "string", description: "New slug" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const milestone = await clientOf(ctx).milestones.update(
			compact({ milestone: args.milestone, name: args.name, slug: args.slug }),
		);
		printRecord(ctx.out, ctx.format, milestone, milestoneRecord);
	},
});

const order = defineCommand({
	meta: { name: "order", description: "Set the order of every milestone of an epic" },
	args: {
		epic: epicArg,
		milestones: {
			type: "positional",
			required: true,
			description: "Every milestone slug of the epic in the new order, such as phase-1 phase-2",
		},
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const client = clientOf(ctx);
		// `milestones.reorder` takes full milestone refs. The epic argument can
		// be a ULID, so the `KEY/epic-slug` prefix comes from the epic record.
		const epic = await client.epics.get({ epic: args.epic });
		// citty keeps every positional in `_`, so the slugs follow the epic ref.
		const milestones = await client.milestones.reorder({
			epic: epic.ref,
			milestones: args._.slice(1).map((slug) => `${epic.ref}/${slug}`),
		});
		printList(ctx.out, ctx.format, milestones, milestoneList);
	},
});

const add = defineCommand({
	meta: { name: "add", description: "Put tickets in a milestone and in its epic" },
	args: {
		milestone: milestoneArg,
		tickets: { type: "positional", required: true, description: "Ticket refs, such as OP-29 OP-30" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		// citty keeps every positional in `_`, so the ticket refs follow the milestone ref.
		const result = await clientOf(ctx).tickets.updateMany({ tickets: args._.slice(1), milestone: args.milestone });
		printList(ctx.out, ctx.format, result.items, ticketList);
	},
});

const remove = defineCommand({
	meta: { name: "remove", description: "Take tickets out of their milestone; they stay in the epic" },
	args: {
		tickets: { type: "positional", required: true, description: "Ticket refs, such as OP-29 OP-30" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).tickets.updateMany({ tickets: context.args._, milestone: null });
		printList(ctx.out, ctx.format, result.items, ticketList);
	},
});

const del = defineCommand({
	meta: { name: "delete", description: "Delete a milestone; its tickets stay in the epic" },
	args: {
		milestone: milestoneArg,
		force: { type: "boolean", description: "Let an agent delete" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const result = await clientOf(ctx).milestones.delete(
			compact({ milestone: args.milestone, force: args.force === true ? true : undefined }),
		);
		printRecord(ctx.out, ctx.format, result, deletedRecord);
	},
});

export default defineCommand({
	meta: { name: "milestones", description: "List, create, edit, order, fill, or delete the milestones of an epic" },
	subCommands: { list, create, edit, order, add, remove, delete: del },
});
