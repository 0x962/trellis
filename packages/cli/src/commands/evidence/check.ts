import { evidenceFloor } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { contextOf, wantsJson } from "../../context.ts";
import { notFound } from "../../errors.ts";
import { json } from "../../output.ts";
import { resolvePullRequest } from "../pullRequestRef.ts";
import { checkText, evidenceCheckResult } from "./checkText.ts";

export default defineCommand({
	meta: { name: "check", description: "Check the evidence floor of a pull request" },
	args: {
		ref: { type: "positional", required: true, description: "Pull request number, URL, or owner/repo#123" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const resolved = await resolvePullRequest(client, context.args.ref, false);
		const pullRequest = await client.pullRequests.refresh({ id: resolved.id });
		const status = await client.reviews.status({ pr: resolved.url });
		if (status.ticket === null || status.prRow === null) throw notFound("linked ticket", context.args.ref);
		if (status.prRow.kind === null || status.prRow.risk === null)
			throw notFound("complete changed-file list for pull request", context.args.ref);
		const headSha = status.headRefOid as string;
		const [ticket, rows, summary] = await Promise.all([
			client.tickets.get({ ticket: status.ticket.identifier }),
			client.pullRequests.listEvidence({ id: resolved.id }),
			client.pullRequests.readSummaryHead({ id: resolved.id, headSha }),
		]);
		const floor = evidenceFloor({
			kind: status.prRow.kind,
			risk: status.prRow.risk,
			rows: rows.filter((row) => row.headSha === headSha),
			hasSummary: summary !== null,
		});
		const result = evidenceCheckResult({
			pullRequest: { number: pullRequest.number, url: pullRequest.url, headSha },
			ticket: status.ticket,
			kind: floor.kind,
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
		ctx.out.write(wantsJson(ctx) ? json(result) : checkText(result));
		return result.complete ? 0 : 1;
	},
});
