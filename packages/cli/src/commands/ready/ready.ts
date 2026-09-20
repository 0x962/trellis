import { isAgentWorking, type TicketSummary, turnOf } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { contextOf } from "../../context.ts";
import { json } from "../../output.ts";
import { type ReadyResult, readyGroupOrder, readyText } from "./readyText.ts";

const identifierFor = (ticket: TicketSummary, turn: ReturnType<typeof turnOf>): string => {
	if (ticket.status.reviewer === "human") return ticket.identifier;
	const pullRequest = ticket.prRows.find((row) => turnOf(row, false) === turn);
	return pullRequest === undefined ? ticket.identifier : `#${pullRequest.number}`;
};

export const readyResult = (tickets: TicketSummary[], workingTicketIds: ReadonlySet<string>): ReadyResult => {
	const readyToStart = tickets.filter((ticket) => turnOf(ticket, workingTicketIds.has(ticket.id)) === "ready");
	const groups = readyGroupOrder.flatMap(({ turn, label }) => {
		const identifiers = tickets.flatMap((ticket) => {
			const ticketTurn = turnOf(ticket, workingTicketIds.has(ticket.id));
			return ticketTurn === turn ? [identifierFor(ticket, ticketTurn)] : [];
		});
		return identifiers.length === 0 ? [] : [{ turn, label, count: identifiers.length, identifiers }];
	});
	return {
		readyToStart: { count: readyToStart.length, identifiers: readyToStart.map((ticket) => ticket.identifier) },
		groups,
	};
};

export default defineCommand({
	meta: { name: "ready", description: "Show who holds each ticket of an epic" },
	args: {
		project: { type: "positional", required: true, description: "Root project ref, such as OP" },
		epic: { type: "string", required: true, description: "Epic slug, such as routines-e2e" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const [epic, runs] = await Promise.all([
			client.epics.get({ epic: `${context.args.project}/${context.args.epic}` }),
			client.agentRuns.list({ assigned: true }),
		]);
		const workingTicketIds = new Set(
			runs.flatMap((run) =>
				run.kind === "agent" && run.ticketId !== null && isAgentWorking(run) ? [run.ticketId] : [],
			),
		);
		const result = readyResult(epic.tickets, workingTicketIds);
		if (ctx.format.mode === "quiet") {
			ctx.out.write(`${result.readyToStart.identifiers.join("\n")}${result.readyToStart.count === 0 ? "" : "\n"}`);
			return;
		}
		if (ctx.format.mode === "json" || ctx.format.mode === "jsonl") {
			ctx.out.write(json(result));
			return;
		}
		ctx.out.write(readyText(result));
	},
});
