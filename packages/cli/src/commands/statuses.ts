import type { ColorToken, Reviewer, Status, StatusCategory } from "@trellis/api";
import { StatusAgentConfigSchema } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { type CliContext, compact, contextOf, readText, toNumber } from "../context.ts";
import { notFound, usageError } from "../errors.ts";
import { cell, json, type ListSpec, printList, printRecord, type RecordSpec } from "../output.ts";

const statusList: ListSpec<Status> = {
	columns: [
		{ name: "slug", value: (row) => row.slug },
		{ name: "name", value: (row) => cell(row.name) },
		{ name: "category", value: (row) => row.category },
		{ name: "reviewer", value: (row) => cell(row.reviewer) },
		{ name: "color", value: (row) => row.color },
		{ name: "default", value: (row) => (row.isDefault ? "yes" : "-") },
	],
	identifier: (row) => row.slug,
};

const statusRecord: RecordSpec<Status> = {
	fields: [
		{ name: "slug", value: (row) => row.slug },
		{ name: "id", value: (row) => row.id },
		{ name: "name", value: (row) => cell(row.name) },
		{ name: "category", value: (row) => row.category },
		{ name: "reviewer", value: (row) => cell(row.reviewer) },
		{ name: "color", value: (row) => row.color },
		{ name: "position", value: (row) => String(row.position) },
		{ name: "wipLimit", value: (row) => cell(row.wipLimit) },
		{ name: "default", value: (row) => (row.isDefault ? "yes" : "no") },
		{ name: "description", value: (row) => cell(row.description) },
	],
	identifier: (row) => row.slug,
};

const descriptionFlag = {
	type: "string",
	description: "The column description in markdown; - reads standard input",
} as const;

const descriptionOf = (ctx: CliContext, value: string | undefined): Promise<string | undefined> =>
	value === undefined ? Promise.resolve(undefined) : readText(ctx, value);

const list = defineCommand({
	meta: { name: "list", description: "Read the effective status set" },
	args: { project: { type: "positional", required: true, description: "Project ref" } },
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).statuses.list({ project: context.args.project });
		// `json` is the procedure output, which carries `inheritedFrom` beside
		// the statuses. Every other mode prints one status per row.
		if (ctx.format.mode === "json") {
			ctx.out.write(json(result));
			return;
		}
		printList(ctx.out, ctx.format, result.statuses, statusList);
	},
});

const add = defineCommand({
	meta: { name: "add", description: "Add a status" },
	args: {
		project: { type: "positional", required: true, description: "Project ref" },
		name: { type: "positional", required: true, description: "Name" },
		category: { type: "enum", options: ["todo", "started", "review", "done", "canceled"], required: true },
		reviewer: { type: "enum", options: ["human", "agent"], description: "Who reviews, for a review status" },
		description: descriptionFlag,
		color: { type: "string", description: "Color token" },
		position: { type: "string", description: "Position in the column order" },
		"agent-config": { type: "string", description: "Worker configuration as JSON; null makes the column manual" },
		"wip-limit": { type: "string", description: "Work in progress limit" },
		default: { type: "boolean", description: "Make it the default status of new tickets" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const status = await clientOf(ctx).statuses.create(
			compact({
				project: args.project,
				name: args.name,
				category: args.category as StatusCategory,
				reviewer: args.reviewer as Reviewer | undefined,
				description: await descriptionOf(ctx, args.description),
				color: args.color as ColorToken | undefined,
				position: toNumber(args.position),
				wipLimit: toNumber(args["wip-limit"]),
				agentConfig:
					args["agent-config"] === undefined
						? undefined
						: StatusAgentConfigSchema.nullable().parse(JSON.parse(args["agent-config"])),
				isDefault: args.default === true ? true : undefined,
			}),
		);
		printRecord(ctx.out, ctx.format, status, statusRecord);
	},
});

// A status matches its ref by slug, by id, by name, or by category. The
// list is in position order, so `category:<category>` names the first
// status of that category, the way the server resolves the ref.
const matches = (status: Status, ref: string) => {
	const lower = ref.toLowerCase();
	if (lower.startsWith("category:")) return status.category === lower.slice("category:".length);
	return status.slug === lower || status.id === ref.toUpperCase() || status.name.toLowerCase() === lower;
};

// A position is an index in the column order, so it is a whole number.
const wholeNumber = /^(0|[1-9][0-9]*)$/;

const edit = defineCommand({
	meta: { name: "edit", description: "Change status fields" },
	args: {
		project: { type: "positional", required: true, description: "Project ref" },
		status: { type: "positional", required: true, description: "Status ref" },
		name: { type: "string", description: "New name" },
		description: descriptionFlag,
		color: { type: "string", description: "New color token" },
		reviewer: { type: "enum", options: ["human", "agent"], description: "New reviewer" },
		"agent-config": { type: "string", description: "Worker configuration as JSON; null makes the column manual" },
		"wip-limit": { type: "string", description: "New work in progress limit" },
		position: { type: "string", description: "New position in the column order" },
		default: { type: "boolean", description: "Make it the default status" },
		category: { type: "string", description: "Refused: the category is immutable" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		if (args.category !== undefined)
			throw usageError("the category of a status is immutable; add a new status instead");
		if (args.position !== undefined && !wholeNumber.test(args.position))
			throw usageError(`--position needs a whole number, not "${args.position}"`);
		const client = clientOf(ctx);
		const fields = compact({
			name: args.name,
			description: await descriptionOf(ctx, args.description),
			color: args.color as ColorToken | undefined,
			reviewer: args.reviewer as Reviewer | undefined,
			wipLimit: toNumber(args["wip-limit"]),
			agentConfig:
				args["agent-config"] === undefined
					? undefined
					: StatusAgentConfigSchema.nullable().parse(JSON.parse(args["agent-config"])),
			isDefault: args.default === true ? true : undefined,
		});
		const updated =
			Object.keys(fields).length === 0
				? undefined
				: await client.statuses.update({ project: args.project, status: args.status, ...fields });
		// One run prints one document. The reorder answer is the last state
		// of the set and it carries the fields the update wrote, so a run that
		// does both prints the set alone.
		if (args.position === undefined) {
			if (updated !== undefined) printRecord(ctx.out, ctx.format, updated, statusRecord);
			return;
		}
		const { statuses } = await client.statuses.list({ project: args.project });
		const target = statuses.find((status) => matches(status, args.status));
		if (target === undefined) throw notFound("status", args.status);
		const order = statuses.filter((status) => status !== target).map((status) => status.slug);
		order.splice(Number(args.position), 0, target.slug);
		const result = await client.statuses.reorder({ project: args.project, statuses: order });
		printList(ctx.out, ctx.format, result.statuses, statusList);
	},
});

const rm = defineCommand({
	meta: { name: "rm", description: "Delete a status" },
	args: {
		project: { type: "positional", required: true, description: "Project ref" },
		status: { type: "positional", required: true, description: "Status ref" },
		"move-to": { type: "string", description: "Status ref that takes the tickets" },
		force: { type: "boolean", description: "Accepted for compatibility; completion does not require force" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const result = await clientOf(ctx).statuses.delete(
			compact({
				project: args.project,
				status: args.status,
				moveTo: args["move-to"],
				force: args.force === true ? true : undefined,
			}),
		);
		printRecord(ctx.out, ctx.format, result, {
			fields: [
				{ name: "deleted", value: (row) => row.deleted },
				{ name: "moved", value: (row) => String(row.moved) },
			],
			identifier: (row) => row.deleted,
		});
	},
});

const clear = defineCommand({
	meta: { name: "clear", description: "Drop a sub-project's own set and inherit again" },
	args: { project: { type: "positional", required: true, description: "Project ref" } },
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).statuses.clear({ project: context.args.project });
		printRecord(ctx.out, ctx.format, result, {
			fields: [
				{ name: "inheritedFrom", value: (row) => row.inheritedFrom },
				{ name: "remapped", value: (row) => String(row.remapped) },
			],
			identifier: (row) => row.inheritedFrom,
		});
	},
});

export default defineCommand({
	meta: { name: "statuses", description: "List, add, edit, remove, or clear statuses" },
	subCommands: { list, add, edit, rm, clear },
});
