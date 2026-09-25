import type { PageSummary, ProjectSummary } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, toNumber } from "../context.ts";
import { cell, heading, json, type ListSpec, printList, renderTable, ticketList } from "../output.ts";

const projectHits: ListSpec<ProjectSummary> = {
	columns: [
		{ name: "key", value: (row) => row.key },
		{ name: "name", value: (row) => cell(row.name) },
	],
	identifier: (row) => row.key,
};

const pageHits: ListSpec<PageSummary> = {
	columns: [
		{ name: "ref", value: (row) => row.ref },
		{ name: "title", value: (row) => cell(row.title) },
		{ name: "summary", value: (row) => cell(row.summary) },
		{ name: "version", value: (row) => String(row.latestVersion) },
	],
	identifier: (row) => row.ref,
};

export default defineCommand({
	meta: { name: "search", description: "Search tickets, Pages, and projects" },
	args: {
		q: { type: "positional", required: true, description: "Query text" },
		project: { type: "string", description: "Project ref to search under" },
		limit: { type: "string", description: "Hits per kind, at most 50" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const result = await clientOf(ctx).search.query(
			compact({ q: args.q, project: args.project, limit: toNumber(args.limit) }),
		);
		switch (ctx.format.mode) {
			case "json":
			case "jsonl":
				ctx.out.write(json(result));
				return;
			case "quiet":
				printList(ctx.out, ctx.format, result.tickets, ticketList);
				printList(ctx.out, ctx.format, result.pages, pageHits);
				printList(ctx.out, ctx.format, result.projects, projectHits);
				return;
			case "table":
				ctx.out.write(`${heading("tickets", ctx.format.color)}${renderTable(result.tickets, ticketList.columns)}\n`);
				ctx.out.write(`${heading("pages", ctx.format.color)}${renderTable(result.pages, pageHits.columns)}\n`);
				ctx.out.write(`${heading("projects", ctx.format.color)}${renderTable(result.projects, projectHits.columns)}`);
				return;
		}
	},
});
