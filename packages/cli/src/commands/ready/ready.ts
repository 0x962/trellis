import { isAgentWorking, type TicketSummary, type Turn, turnOf } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { type CliContext, contextOf, wantsJson } from "../../context.ts";
import { notFound } from "../../errors.ts";
import { json } from "../../output.ts";
import { pullRequestCheck } from "../evidence/pullRequestCheck.ts";
import { resolvePullRequest } from "../pullRequestRef.ts";
import { pullRequestReadyText } from "./pullRequestReady.ts";
import { type ReadyResult, readyGroupOrder, readyText } from "./readyText.ts";

const nameFor = (ticket: TicketSummary, turn: Turn, hasWorkingRun: boolean): string => {
	if (hasWorkingRun || ticket.status.reviewer === "human") return ticket.identifier;
	const pullRequest = ticket.prRows.find((row) => turnOf(row, false) === turn);
	return pullRequest === undefined ? ticket.identifier : `#${pullRequest.number}`;
};

export const readyResultOf = (tickets: TicketSummary[], workingTicketIds: ReadonlySet<string>): ReadyResult => {
	const readyToStart = tickets.filter((ticket) => turnOf(ticket, workingTicketIds.has(ticket.id)) === "ready");
	const groups = readyGroupOrder.flatMap(({ turn, label }) => {
		const names = tickets.flatMap((ticket) => {
			const hasWorkingRun = workingTicketIds.has(ticket.id);
			const ticketTurn = turnOf(ticket, hasWorkingRun);
			return ticketTurn === turn ? [nameFor(ticket, ticketTurn, hasWorkingRun)] : [];
		});
		return names.length === 0 ? [] : [{ turn, label, count: names.length, names }];
	});
	return {
		readyToStart: { count: readyToStart.length, identifiers: readyToStart.map((ticket) => ticket.identifier) },
		groups,
	};
};

// Exits 1 until the pull request has the summary and every evidence floor item.
// `trellis pr add` links a pull request but opens no review, so this opens it
// the way `trellis summary write` does.
const pullRequestReady = async (ctx: CliContext, client: TrellisClient, ref: string): Promise<number> => {
	const resolved = await resolvePullRequest(client, ref, true);
	const pullRequest = await client.pullRequests.refresh({ id: resolved.id });
	const status = await client.reviews.status({ pr: resolved.url });
	if (status.ticket === null) throw notFound("linked ticket", ref);
	const ticket = await client.tickets.get({ ticket: status.ticket.identifier });
	const result = await pullRequestCheck(client, ticket, pullRequest);
	ctx.out.write(wantsJson(ctx) ? json(result) : pullRequestReadyText(result));
	return result.complete ? 0 : 1;
};

export default defineCommand({
	meta: { name: "ready", description: "Check a pull request for review, or show who holds each ticket of an epic" },
	args: {
		ref: {
			type: "positional",
			required: true,
			description: "Pull request number, URL, or owner/repo#123; with --epic, the root project ref, such as OP",
		},
		epic: { type: "string", description: "Epic slug, such as routines-e2e" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		if (context.args.epic === undefined) return pullRequestReady(ctx, client, context.args.ref);
		const [epic, runs] = await Promise.all([
			client.epics.get({ epic: `${context.args.ref}/${context.args.epic}` }),
			client.agentRuns.list({ assigned: true }),
		]);
		const workingTicketIds = new Set(
			runs.flatMap((run) =>
				run.kind === "agent" && run.ticketId !== null && isAgentWorking(run) ? [run.ticketId] : [],
			),
		);
		const result = readyResultOf(epic.tickets, workingTicketIds);
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
