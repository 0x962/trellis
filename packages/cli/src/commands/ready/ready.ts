import { isAgentWorking, type TicketSummary, type Turn, turnOf } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { type CliContext, contextOf, wantsJson } from "../../context.ts";
import { usageError } from "../../errors.ts";
import { json } from "../../output.ts";
import { currentHead, type PullRequestRef, resolvePullRequest } from "../pullRequestRef.ts";
import { pullRequestReadiness, pullRequestReadyText } from "./pullRequestReady.ts";
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

export const markPullRequestReady = async (
	client: TrellisClient,
	resolved: { id: string; url: string },
	result: Awaited<ReturnType<typeof pullRequestReadiness>>,
): Promise<void> => {
	if (!result.ready) return;
	if (result.pullRequest.isDraft)
		await client.reviews.action({ pr: resolved.url, action: "ready", headSha: result.pullRequest.headSha });
	await client.pullRequests.setLocalState({ id: resolved.id, localState: "ready" });
};

// Stores the agent's own sentence for the commit the pull request points at
// now. The flow check then takes that sentence in place of a run, and the
// person reads it beside the change.
const recordFlowDoesNotApply = async (client: TrellisClient, ref: PullRequestRef, reason: string): Promise<void> => {
	const head = await currentHead(client, ref);
	await client.pullRequests.writeFlowWaiver({ id: ref.id, headSha: head.sha, reason });
};

// Exits 1 until the pull request has the explanation and the evidence
// document. `trellis pr add` links a pull request but opens no review, so
// this opens it the way `trellis summary write` does.
//
// An agent must also have run a flow on the current head when the server
// holds any flow, or have said with `--flow-does-not-apply` why no flow fits.
// A person is never held back by that, so the check runs only for an agent.
const pullRequestReady = async (
	ctx: CliContext,
	client: TrellisClient,
	ref: string,
	flowDoesNotApply: string | undefined,
): Promise<number> => {
	const resolved = await resolvePullRequest(client, ref, true);
	if (flowDoesNotApply !== undefined) {
		if (flowDoesNotApply.trim() === "")
			throw usageError('--flow-does-not-apply needs the reason: --flow-does-not-apply "<reason>"');
		await recordFlowDoesNotApply(client, resolved, flowDoesNotApply.trim());
	}
	const result = await pullRequestReadiness(client, resolved, { checkFlows: ctx.actor().kind === "agent" });
	await markPullRequestReady(client, resolved, result);
	ctx.out.write(wantsJson(ctx) ? json(result) : pullRequestReadyText(result));
	return result.ready ? 0 : 1;
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
