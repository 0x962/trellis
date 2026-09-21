import type { EpicCounts, WaveSummary } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf } from "../context.ts";
import { cell, type ListSpec, printList, printRecord, type RecordSpec, ticketList } from "../output.ts";

const epicArg = {
	type: "positional" as const,
	required: true as const,
	description: "Epic ref, such as OP/routine-runtime",
};
const waveArg = {
	type: "positional" as const,
	required: true as const,
	description: "Wave ref, such as OP/routine-runtime/phase-1",
};

// A canceled ticket is never done and never counts in the denominator.
export const progress = (row: { counts: EpicCounts }) =>
	`${row.counts.done}/${row.counts.total - row.counts.canceled} done`;

export const countsText = (row: { counts: EpicCounts }) =>
	`todo ${row.counts.todo}, started ${row.counts.started}, review ${row.counts.review}, done ${row.counts.done}, canceled ${row.counts.canceled}`;

export const nextText = (row: WaveSummary) => `to start ${row.toStart}, waits for you ${row.waitsForYou}`;

// The rows arrive in position order, so the table prints no position column.
export const waveList: ListSpec<WaveSummary> = {
	columns: [
		{ name: "ref", value: (row) => row.ref },
		{ name: "state", value: (row) => row.state },
		{ name: "progress", value: progress },
		{ name: "counts", value: countsText },
		{ name: "next", value: nextText },
		{ name: "name", value: (row) => cell(row.name) },
	],
	identifier: (row) => row.ref,
};

const waveRecord: RecordSpec<WaveSummary> = {
	fields: [
		{ name: "ref", value: (row) => row.ref },
		{ name: "id", value: (row) => row.id },
		{ name: "name", value: (row) => cell(row.name) },
		{ name: "slug", value: (row) => row.slug },
		{ name: "position", value: (row) => String(row.position) },
		{ name: "state", value: (row) => row.state },
		{ name: "progress", value: progress },
		{ name: "counts", value: countsText },
		{ name: "next", value: nextText },
	],
	identifier: (row) => row.ref,
};

const deletedRecord: RecordSpec<{ id: string }> = {
	fields: [{ name: "deleted", value: (row) => row.id }],
	identifier: (row) => row.id,
};

const list = defineCommand({
	meta: { name: "list", description: "List the waves of an epic in their order" },
	args: { epic: epicArg },
	async run(context) {
		const ctx = contextOf(context);
		const epic = await clientOf(ctx).epics.get({ epic: context.args.epic });
		printList(ctx.out, ctx.format, epic.waves, waveList);
	},
});

const create = defineCommand({
	meta: { name: "create", description: "Add a wave at the end of an epic" },
	args: {
		epic: epicArg,
		name: { type: "string", required: true, description: "Name, 1 to 120 characters" },
		slug: { type: "string", description: "Slug, unique in the epic; derives from the name when absent" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const wave = await clientOf(ctx).waves.create(compact({ epic: args.epic, name: args.name, slug: args.slug }));
		printRecord(ctx.out, ctx.format, wave, waveRecord);
	},
});

const edit = defineCommand({
	meta: { name: "edit", description: "Change the fields of a wave that you pass" },
	args: {
		wave: waveArg,
		name: { type: "string", description: "New name" },
		slug: { type: "string", description: "New slug" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const wave = await clientOf(ctx).waves.update(compact({ wave: args.wave, name: args.name, slug: args.slug }));
		printRecord(ctx.out, ctx.format, wave, waveRecord);
	},
});

const order = defineCommand({
	meta: { name: "order", description: "Set the order of every wave of an epic" },
	args: {
		epic: epicArg,
		waves: {
			type: "positional",
			required: true,
			description: "Every wave slug of the epic in the new order, such as phase-1 phase-2",
		},
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const client = clientOf(ctx);
		// `waves.reorder` takes full wave refs. The epic argument can
		// be a ULID, so the `KEY/epic-slug` prefix comes from the epic record.
		const epic = await client.epics.get({ epic: args.epic });
		// citty keeps every positional in `_`, so the slugs follow the epic ref.
		// An argument with a slash is a full wave ref and goes out as it
		// is, so the server answers WAVE_OUTSIDE_EPIC for a ref of another
		// epic.
		const waves = await client.waves.reorder({
			epic: epic.ref,
			waves: args._.slice(1).map((slug) => (slug.includes("/") ? slug : `${epic.ref}/${slug}`)),
		});
		printList(ctx.out, ctx.format, waves, waveList);
	},
});

const add = defineCommand({
	meta: { name: "add", description: "Put tickets in a wave and in its epic" },
	args: {
		wave: waveArg,
		tickets: { type: "positional", required: true, description: "Ticket refs, such as OP-29 OP-30" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		// citty keeps every positional in `_`, so the ticket refs follow the wave ref.
		const result = await clientOf(ctx).tickets.updateMany({ tickets: args._.slice(1), wave: args.wave });
		printList(ctx.out, ctx.format, result.items, ticketList);
	},
});

const remove = defineCommand({
	meta: { name: "remove", description: "Take tickets out of their wave; they stay in the epic" },
	args: {
		tickets: { type: "positional", required: true, description: "Ticket refs, such as OP-29 OP-30" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).tickets.updateMany({ tickets: context.args._, wave: null });
		printList(ctx.out, ctx.format, result.items, ticketList);
	},
});

const del = defineCommand({
	meta: { name: "delete", description: "Delete a wave; its tickets stay in the epic" },
	args: {
		wave: waveArg,
		force: { type: "boolean", description: "Let an agent delete" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const result = await clientOf(ctx).waves.delete(
			compact({ wave: args.wave, force: args.force === true ? true : undefined }),
		);
		printRecord(ctx.out, ctx.format, result, deletedRecord);
	},
});

export default defineCommand({
	meta: { name: "waves", description: "List, create, edit, order, fill, or delete the waves of an epic" },
	subCommands: { list, create, edit, order, add, remove, delete: del },
});
