import type { ColorToken, Reviewer, Status, StatusCategory } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, toNumber } from "../context.ts";
import { usageError } from "../errors.ts";
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
	],
	identifier: (row) => row.slug,
};

const list = defineCommand({
	meta: { name: "list", description: "Read the effective status set" },
	args: { project: { type: "positional", required: true, description: "Project ref" } },
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).statuses.list({ project: context.args.project });
		if (ctx.format.mode === "json" || ctx.format.mode === "jsonl") {
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
		color: { type: "string", description: "Color token" },
		position: { type: "string", description: "Position in the column order" },
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
				color: args.color as ColorToken | undefined,
				position: toNumber(args.position),
				wipLimit: toNumber(args["wip-limit"]),
				isDefault: args.default === true ? true : undefined,
			}),
		);
		printRecord(ctx.out, ctx.format, status, statusRecord);
	},
});

// A status matches its ref by slug, by id, or by name.
const matches = (status: Status, ref: string) =>
	status.slug === ref.toLowerCase() ||
	status.id === ref.toUpperCase() ||
	status.name.toLowerCase() === ref.toLowerCase();

const edit = defineCommand({
	meta: { name: "edit", description: "Change status fields" },
	args: {
		project: { type: "positional", required: true, description: "Project ref" },
		status: { type: "positional", required: true, description: "Status ref" },
		name: { type: "string", description: "New name" },
		color: { type: "string", description: "New color token" },
		reviewer: { type: "enum", options: ["human", "agent"], description: "New reviewer" },
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
		const client = clientOf(ctx);
		const fields = compact({
			name: args.name,
			color: args.color as ColorToken | undefined,
			reviewer: args.reviewer as Reviewer | undefined,
			wipLimit: toNumber(args["wip-limit"]),
			isDefault: args.default === true ? true : undefined,
		});
		if (Object.keys(fields).length > 0) {
			const status = await client.statuses.update({ project: args.project, status: args.status, ...fields });
			printRecord(ctx.out, ctx.format, status, statusRecord);
		}
		if (args.position === undefined) return;
		const { statuses } = await client.statuses.list({ project: args.project });
		const target = statuses.find((status) => matches(status, args.status))!;
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
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const result = await clientOf(ctx).statuses.delete(
			compact({ project: args.project, status: args.status, moveTo: args["move-to"] }),
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
