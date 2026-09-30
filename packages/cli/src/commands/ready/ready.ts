import { type TicketSummary, type Waiting, waitingFor } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { type CliContext, contextOf, wantsJson } from "../../context.ts";
import { json } from "../../output.ts";
import { resolvePullRequest } from "../pullRequestRef.ts";
import { requestReview } from "../requestReview/index.ts";
import { workingTicketIds } from "../workingTicketIds/index.ts";
import { type ReadyResult, readyGroupOrder, readyText } from "./readyText.ts";

const nameFor = (ticket: TicketSummary, waiting: Waiting, hasWorkingRun: boolean): string => {
	if (hasWorkingRun || ticket.status.category === "review") return ticket.identifier;
	const pullRequest = ticket.prRows.find((row) => waitingFor(row, false) === waiting);
	return pullRequest === undefined ? ticket.identifier : `#${pullRequest.number}`;
};

export const readyResultOf = (tickets: TicketSummary[], workingTicketIds: ReadonlySet<string>): ReadyResult => {
	const readyToStart = tickets.filter((ticket) => waitingFor(ticket, workingTicketIds.has(ticket.id)) === "ready");
	const groups = readyGroupOrder.flatMap(({ waiting, label }) => {
		const names = tickets.flatMap((ticket) => {
			const hasWorkingRun = workingTicketIds.has(ticket.id);
			const ticketWaiting = waitingFor(ticket, hasWorkingRun);
			return ticketWaiting === waiting ? [nameFor(ticket, ticketWaiting, hasWorkingRun)] : [];
		});
		return names.length === 0 ? [] : [{ waiting, label, count: names.length, names }];
	});
	return {
		readyToStart: { count: readyToStart.length, identifiers: readyToStart.map((ticket) => ticket.identifier) },
		groups,
	};
};

const pullRequestReady = async (
	ctx: CliContext,
	client: TrellisClient,
	ref: string,
	flowDoesNotApply: string | undefined,
): Promise<number> => {
	const resolved = await resolvePullRequest(client, ref, true);
	const pullRequest = await requestReview(client, resolved, flowDoesNotApply);
	ctx.out.write(
		wantsJson(ctx)
			? json({ pullRequest, requestRecorded: true })
			: `#${pullRequest.number} is ready for review in Trellis. Use trellis diff check ${pullRequest.number} to read review gaps.\n`,
	);
	return 0;
};

export default defineCommand({
	meta: {
		name: "ready",
		description: "Request local review of a pull request, or show what each ticket of an epic waits for",
	},
	args: {
		ref: {
			type: "positional",
			required: true,
			description: "Pull request number, URL, or owner/repo#123; with --epic, the project ref, such as OP",
		},
		epic: { type: "string", description: "Epic slug, such as routines-e2e" },
		"flow-does-not-apply": {
			type: "string",
			valueHint: "reason",
			description: "Record why no flow fits this change, in place of a flow run",
		},
	},
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		if (context.args.epic === undefined)
			return pullRequestReady(ctx, client, context.args.ref, context.args["flow-does-not-apply"]);
		const epicRef = `${context.args.ref}/${context.args.epic}`;
		const [epic, working] = await Promise.all([client.epics.get({ epic: epicRef }), workingTicketIds(client, epicRef)]);
		const result = readyResultOf(epic.tickets, working);
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
