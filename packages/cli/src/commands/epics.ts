import {
	type Epic,
	type EpicSummary,
	epicBandLine,
	epicCountLine,
	epicWaveHeading,
	pullRequestRowLine,
	type TicketSummary,
	type WaveSummary,
} from "@trellis/api";
import { shortZonedDateTime } from "@trellis/api/time";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, readText } from "../context.ts";
import template from "../instructions.md" with { type: "text" };
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
import { planGuideText } from "./epics/planGuide.ts";
import { countsText, progress, waveList } from "./waves.ts";

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

const epicList: ListSpec<EpicSummary> = {
	columns: [
		{ name: "ref", value: (row) => row.ref },
		{ name: "state", value: (row) => row.state },
		{ name: "progress", value: progress },
		{ name: "name", value: (row) => cell(row.name) },
		{ name: "project", value: (row) => row.projectKey },
		{ name: "updated", value: (row) => shortZonedDateTime(row.updatedAt) },
	],
	identifier: (row) => row.ref,
};

// The current wave and its place among the waves of the epic.
const current = (epic: EpicSummary) =>
	epic.currentWave === null ? "-" : cell(`${epic.currentWave.name} (${epic.currentWaveIndex} of ${epic.waveCount})`);

// The description is not a field: it has many lines, so `show` prints it
// below the block.
const epicRecord: RecordSpec<EpicSummary> = {
	fields: [
		{ name: "current", value: current },
		{ name: "ref", value: (row) => row.ref },
		{ name: "id", value: (row) => row.id },
		{ name: "name", value: (row) => cell(row.name) },
		{ name: "slug", value: (row) => row.slug },
		{ name: "project", value: (row) => row.projectKey },
		{ name: "state", value: (row) => row.state },
		{ name: "progress", value: progress },
		{ name: "counts", value: countsText },
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
	meta: { name: "list", description: "List the epics of a project, open first" },
	args: { project: projectArg },
	async run(context) {
		const ctx = contextOf(context);
		const epics = await clientOf(ctx).epics.list({ project: context.args.project });
		printList(ctx.out, ctx.format, epics, epicList);
	},
});

// Two spaces put a pull request line under its ticket row.
const prLines = (ticket: TicketSummary): string[] => ticket.prRows.map((pr) => `  ${pullRequestRowLine(pr)}`);

// One ticket table under its heading. The tickets keep their number order.
const ticketSection = (title: string, tickets: Epic["tickets"], color: boolean): string =>
	`\n${heading(title, color)}${renderTable<TicketSummary>(tickets, ticketList.columns, prLines)}`;

// `epic.currentWave` is a link. This finds the wave row of the
// epic with the same id, because the count line reads its counts.
const currentWave = (epic: Epic): WaveSummary | undefined =>
	epic.waves.find((wave) => wave.id === epic.currentWave?.id);

// An epic with no wave prints one ticket table. An epic with waves
// prints the wave table, then one ticket table for each wave in
// position order. A wave heading carries the name, the ref, the word
// `current` on the wave the epic works in now, and the counts of that
// wave. The "no wave" table prints only when a ticket of the epic
// holds no wave.
const renderTickets = (epic: Epic, color: boolean): string => {
	if (epic.waves.length === 0) return ticketSection("tickets", epic.tickets, color);
	const table = `\n${heading("waves", color)}${renderTable(epic.waves, waveList.columns)}`;
	const sections = epic.waves.map((wave) =>
		ticketSection(
			epicWaveHeading(wave, wave.id === epic.currentWave?.id),
			epic.tickets.filter((ticket) => ticket.wave?.id === wave.id),
			color,
		),
	);
	const loose = epic.tickets.filter((ticket) => ticket.wave === null);
	const rest = loose.length === 0 ? "" : ticketSection("no wave", loose, color);
	return `${table}${sections.join("")}${rest}`;
};

// The band of the epic page: the tickets by status, then what the person can
// do in the wave the epic works in now. An epic with every wave
// done prints the band line alone.
const renderBand = (epic: Epic): string => {
	const wave = currentWave(epic);
	const countLine = wave === undefined ? "" : `${epicCountLine(wave)}\n`;
	return `\n${epicBandLine(epic.counts)}\n${countLine}`;
};

// The record block, the band, the description, then the waves and the
// tickets.
const renderEpic = (epic: Epic, color: boolean): string => {
	const block = renderRecord(epic, epicRecord.fields);
	const description = epic.description === "" ? "" : `\n${epic.description}\n`;
	return `${block}${renderBand(epic)}${description}${renderTickets(epic, color)}`;
};

const show = defineCommand({
	meta: { name: "show", description: "Show one epic, its waves, and its tickets" },
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

const guide = defineCommand({
	meta: { name: "guide", description: "Print how to plan an epic: fronts, waves, and dependencies" },
	run(context) {
		contextOf(context).out.write(planGuideText(template));
	},
});

const create = defineCommand({
	meta: { name: "create", description: "Create an epic in a project" },
	args: {
		project: projectArg,
		name: { type: "string", required: true, description: "Name, 1 to 120 characters" },
		slug: { type: "string", description: "Slug, unique in the project; derives from the name when absent" },
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
	meta: { name: "epics", description: "List, show, plan, create, edit, fill, or delete the epics of a project" },
	subCommands: { list, show, guide, create, edit, add, remove, delete: del },
});
