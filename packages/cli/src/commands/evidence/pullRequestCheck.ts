import { evidenceFloor, type LinkedPullRequest, type Ticket } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { notFound } from "../../errors.ts";
import { evidenceCheckResult } from "./check.ts";
import type { EvidenceCheckResult } from "./checkText.ts";

// The evidence floor of one linked pull request at its current head. The
// summary counts as one floor item, so a pull request without it is never
// complete.
export const pullRequestCheck = async (
	client: TrellisClient,
	ticket: Ticket,
	linked: Pick<LinkedPullRequest, "id" | "number" | "url">,
): Promise<EvidenceCheckResult> => {
	const status = await client.reviews.status({ pr: linked.url });
	if (status.prRow === null) throw notFound("pull request row", linked.url);
	if (status.prRow.kind === null || status.prRow.risk === null)
		throw notFound("complete changed-file list for pull request", linked.url);
	if (status.prRow.evidence === null || status.prRow.evidenceRequired === null)
		throw notFound("evidence floor for pull request", linked.url);
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
		present: status.prRow.evidence,
		required: status.prRow.evidenceRequired,
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
