import type { ProjectSummary } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, toNumber } from "../context.ts";
import { cell, heading, json, type ListSpec, printList, renderTable, ticketList } from "../output.ts";

const projectHits: ListSpec<ProjectSummary> = {
	columns: [
		{ name: "path", value: (row) => row.path },
		{ name: "name", value: (row) => cell(row.name) },
	],
	identifier: (row) => row.path,
};

export default defineCommand({
	meta: { name: "search", description: "Search tickets and projects" },
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
				printList(ctx.out, ctx.format, result.projects, projectHits);
				return;
			case "table":
				ctx.out.write(`${heading("tickets", ctx.format.color)}${renderTable(result.tickets, ticketList.columns)}\n`);
				ctx.out.write(`${heading("projects", ctx.format.color)}${renderTable(result.projects, projectHits.columns)}`);
				return;
		}
	},
});
