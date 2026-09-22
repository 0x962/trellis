import type { LinkedPullRequest, PullRequest } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { contextOf, wantsJson } from "../context.ts";
import { pullRequestNotReady } from "../errors.ts";
import { cell, json, printList, printRecord, type RecordSpec, timeCell } from "../output.ts";
import { deletedRecord } from "./delete.ts";
import { pullRequestCheck } from "./evidence/pullRequestCheck.ts";
import { pullRequestReadyText } from "./ready/pullRequestReady.ts";
import { prList } from "./show.ts";

const prRecord: RecordSpec<PullRequest> = {
	fields: [
		{ name: "id", value: (row) => row.id },
		{ name: "url", value: (row) => row.url },
		{ name: "title", value: (row) => cell(row.title) },
		{
			name: "state",
			value: (row) => (row.isQueued ? "queued" : row.state === "open" && row.isDraft ? "draft" : row.state),
		},
		{ name: "ciState", value: (row) => row.ciState },
		{ name: "reviewState", value: (row) => row.reviewState },
		{ name: "head", value: (row) => `${row.headRef} -> ${row.baseRef}` },
		{ name: "fetched", value: (row) => timeCell(row.fetchedAt) },
		{ name: "fetchError", value: (row) => cell(row.fetchError) },
	],
	identifier: (row) => row.id,
};

// The server stores the link even when gh is down; the row then carries
// `fetchError`. The verb prints the row and still exits 6 for the outage.
// After a link that gh could read, the verb prints the evidence floor when
// an item is missing. An agent then gets exit 1; a person keeps exit 0. The
// link stays in both cases, because the summary, the evidence and
// `trellis ready` read the floor from the linked row.
const add = defineCommand({
	meta: { name: "add", description: "Link a pull request by URL" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		url: { type: "positional", required: true, description: "Pull request URL" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const row: LinkedPullRequest = await client.pullRequests.link({
			ticket: context.args.ticket,
			url: context.args.url,
		});
		printRecord(ctx.out, ctx.format, row, prRecord);
		if (row.fetchError !== null) {
			ctx.err.write(`warning: gh could not read the pull request: ${row.fetchError}\n`);
			return 6;
		}
		const ticket = await client.tickets.get({ ticket: context.args.ticket });
		const result = await pullRequestCheck(client, ticket, row);
		if (result.complete) return 0;
		ctx.out.write(wantsJson(ctx) ? json(result) : `\n${pullRequestReadyText(result)}`);
		if (ctx.actor().kind === "agent") throw pullRequestNotReady(row.number);
		return 0;
	},
});

const list = defineCommand({
	meta: { name: "list", description: "List the pull requests on a ticket" },
	args: { ticket: { type: "positional", required: true, description: "Ticket ref" } },
	async run(context) {
		const ctx = contextOf(context);
		const rows = await clientOf(ctx).pullRequests.list({ ticket: context.args.ticket });
		printList(ctx.out, ctx.format, rows, prList);
	},
});

const rm = defineCommand({
	meta: { name: "rm", description: "Remove a pull request from a ticket" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		id: { type: "positional", required: true, description: "Pull request id" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).pullRequests.unlink({ ticket: context.args.ticket, id: context.args.id });
		printRecord(ctx.out, ctx.format, result, deletedRecord);
	},
});

const refresh = defineCommand({
	meta: { name: "refresh", description: "Poll one pull request now" },
	args: { id: { type: "positional", required: true, description: "Pull request id" } },
	async run(context) {
		const ctx = contextOf(context);
		const row = await clientOf(ctx).pullRequests.refresh({ id: context.args.id });
		printRecord(ctx.out, ctx.format, row, prRecord);
	},
});

const diff = defineCommand({
	meta: { name: "diff", description: "Print the diff, cut at 1 MB" },
	args: { id: { type: "positional", required: true, description: "Pull request id" } },
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).pullRequests.diff({ id: context.args.id });
		if (wantsJson(ctx)) {
			ctx.out.write(json(result));
			return;
		}
		ctx.out.write(result.diff);
		if (result.truncated) ctx.err.write(`the diff was cut at 1 MB; the whole diff is at ${result.url}\n`);
	},
});

export default defineCommand({
	meta: { name: "pr", description: "Link, list, remove, refresh, or diff pull requests" },
	subCommands: { add, list, rm, refresh, diff },
});
