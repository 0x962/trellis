import { evidenceFloor, type LinkedPullRequest, type Ticket } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import type { ActorKind } from "../../actor.ts";
import { notFound } from "../../errors.ts";
import { evidenceCheckResult } from "../evidence/check.ts";

const checkPullRequest = async (client: TrellisClient, ticket: Ticket, linked: LinkedPullRequest) => {
	const status = await client.reviews.status({ pr: linked.url });
	if (status.prRow === null) throw notFound("pull request row", linked.url);
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
		pullRequest: { number: linked.number, url: linked.url, headSha },
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

const statusMatches = (status: Ticket["status"], ref: string) => {
	const lower = ref.toLowerCase();
	if (lower.startsWith("category:")) return status.category === lower.slice("category:".length);
	return status.slug === lower || status.id === ref.toUpperCase() || status.name.toLowerCase() === lower;
};

// Both actors receive the same missing list. blocksAgent stops only an agent from the hand-over.
export const handOverGuard = async (
	client: TrellisClient,
	actorKind: ActorKind,
	ticketRef: string,
	statusRef: string,
): Promise<{ result: Awaited<ReturnType<typeof checkPullRequest>>; blocksAgent: boolean } | null> => {
	const ticket = await client.tickets.get({ ticket: ticketRef });
	const { statuses } = await client.statuses.list({ project: ticket.project.path });
	const status = statuses.find((candidate) => statusMatches(candidate, statusRef));
	if (status?.slug !== "human-review") return null;
	for (const linked of ticket.prs.filter((pullRequest) => pullRequest.state === "open")) {
		const result = await checkPullRequest(client, ticket, linked);
		if (!result.complete) return { result, blocksAgent: actorKind === "agent" };
	}
	return null;
};
