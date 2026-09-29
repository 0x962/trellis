import { AGENT_RUN_LIST_LIMIT, AGENT_RUN_LIST_WINDOW_HOURS, type AgentRun } from "@trellis/api";
import { shortZonedDateTime } from "@trellis/api/time";
import { defineCommand } from "citty";
import { positiveInteger } from "../../arguments.ts";
import { clientOf } from "../../client.ts";
import { compact, contextOf } from "../../context.ts";
import { cell, type ListSpec, printListPages } from "../../output.ts";
import { agentPages } from "../agentPages";

const agentList: ListSpec<AgentRun> = {
	columns: [
		{ name: "id", value: (row) => row.id },
		{ name: "kind", value: (row) => row.kind },
		{ name: "name", value: (row) => cell(row.name) },
		{ name: "state", value: (row) => row.state },
		{ name: "ticket", value: (row) => cell(row.ticketIdentifier) },
		{ name: "updated", value: (row) => shortZonedDateTime(row.updatedAt) },
	],
	identifier: (row) => row.id,
};

export const list = defineCommand({
	meta: { name: "list", description: "List agents by ticket or by project" },
	args: {
		ticket: { type: "string", description: "Keep the agents of this ticket" },
		project: { type: "string", description: "Keep the agents of this project" },
		"window-hours": {
			type: "string",
			description: `How many hours of closed agents to keep, on top of the open ones (default ${AGENT_RUN_LIST_WINDOW_HOURS})`,
		},
		limit: { type: "string", description: `How many agents to print at most (default ${AGENT_RUN_LIST_LIMIT})` },
		all: { type: "boolean", description: "Print every matching agent" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const want = args.all ? Number.POSITIVE_INFINITY : (positiveInteger(args.limit, "--limit") ?? AGENT_RUN_LIST_LIMIT);
		await printListPages(
			ctx.out,
			ctx.format,
			agentPages(
				clientOf(ctx),
				compact({
					ticket: args.ticket,
					project: args.project,
					allHistory: args.all && args["window-hours"] === undefined ? true : undefined,
					windowHours: args["window-hours"] === undefined ? undefined : Number(args["window-hours"]),
				}),
				want,
			),
			agentList,
		);
	},
});
