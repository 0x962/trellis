import { type EvidenceFloorItem, evidenceFloor, evidenceWords } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { contextOf, wantsJson } from "../../context.ts";
import { notFound } from "../../errors.ts";
import { json } from "../../output.ts";
import { resolvePullRequest } from "../pullRequestRef.ts";
import { checkText, type EvidenceCheckInput, type EvidenceCheckLine, type EvidenceCheckResult } from "./checkText.ts";

const hintOf = (item: EvidenceFloorItem, verifyCommands: string[]): string => {
	switch (item) {
		case "summary":
			return "write the STE summary:";
		case "after":
			return "capture the head route:";
		case "before":
			return "capture the merge base route:";
		case "capture":
			return "record the capture conditions:";
		case "console":
			return "attach the console list:";
		case "verify":
			return verifyCommands.length === 0
				? "the ticket has no parsed Verify command:"
				: `run each Verify command (${verifyCommands.join("; ")}):`;
		case "test":
			return "name each new test:";
		case "contract":
			return "write the before and after table, or:";
		case "migration":
			return "attach the migration plan:";
		case "picture":
			return "add one picture:";
		case "equivalence":
			return "prove equivalent coverage:";
	}
};

const fillPlaceholders = (command: string, number: number, headSha: string): string =>
	command.replaceAll("<pr>", String(number)).replaceAll("<head>", headSha);

export const evidenceCheckResult = ({ floor, verifyCommands, ...input }: EvidenceCheckInput): EvidenceCheckResult => {
	const gaps = new Map(floor.missing.map((gap) => [gap.item, gap]));
	const items: EvidenceCheckLine[] = floor.required.map((item) => {
		const gap = gaps.get(item);
		return {
			item,
			label: evidenceWords[item],
			status: gap === undefined ? "present" : gap.soft ? "due" : "MISSING",
			hint: gap === undefined ? null : hintOf(item, verifyCommands),
			command:
				gap === undefined
					? null
					: fillPlaceholders(gap.fillCommand, input.pullRequest.number, input.pullRequest.headSha),
		};
	});
	return {
		...input,
		kind: floor.kind,
		present: floor.present.length,
		required: floor.required.length,
		complete: floor.missing.length === 0,
		items,
	};
};

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
		if (typeof status.headRefOid !== "string") throw notFound("head sha of pull request", context.args.ref);
		const headSha = status.headRefOid;
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
