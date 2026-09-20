import { evidenceFloor, type LinkedPullRequest, type Ticket } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import type { ActorKind } from "../../actor.ts";
import { notFound } from "../../errors.ts";
import { evidenceCheckResult } from "../evidence/check.ts";
import { checkText } from "../evidence/checkText.ts";

const checkPullRequest = async (client: TrellisClient, ticket: Ticket, linked: LinkedPullRequest) => {
	const pullRequest = await client.pullRequests.refresh({ id: linked.id });
	const status = await client.reviews.status({ pr: linked.url });
	if (status.prRow === null) throw notFound("linked ticket", linked.url);
	if (status.prRow.kind === null || status.prRow.risk === null)
		throw notFound("complete changed-file list for pull request", linked.url);
	if (typeof status.headRefOid !== "string") throw notFound("head sha of pull request", linked.url);
	const headSha = status.headRefOid;
	const [rows, summary] = await Promise.all([
		client.pullRequests.listEvidence({ id: linked.id }),
		client.pullRequests.readSummaryHead({ id: linked.id, headSha }),
	]);
	const floor = evidenceFloor({
		kind: status.prRow.kind,
		risk: status.prRow.risk,
		rows: rows.filter((row) => row.headSha === headSha),
		hasSummary: summary !== null,
	});
	return evidenceCheckResult({
		pullRequest: { number: pullRequest.number, url: pullRequest.url, headSha },
		ticket: { identifier: ticket.identifier, title: ticket.title },
		floor,
		verifyCommands: ticket.contract.verify,
		checks: {
			pass: status.prRow.pass,
			fail: status.prRow.fail,
			pending: status.prRow.pending,
			skipped: status.prRow.skipped,
			failedChecks: status.prRow.failedChecks,
		},
	});
};

export const handOverGuard = async (
	client: TrellisClient,
	actorKind: ActorKind,
	ticketRef: string,
	target: string,
): Promise<{ text: string; refuses: boolean } | null> => {
	if (target !== "human-review") return null;
	const ticket = await client.tickets.get({ ticket: ticketRef });
	for (const pullRequest of ticket.prs) {
		const result = await checkPullRequest(client, ticket, pullRequest);
		if (!result.complete) return { text: checkText(result), refuses: actorKind === "agent" };
	}
	return null;
};
