import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { contextOf, wantsJson } from "../../context.ts";
import { usageError } from "../../errors.ts";
import { json, printList } from "../../output.ts";
import { resolvePullRequest } from "../pullRequestRef.ts";

const ref = { type: "positional", required: true, description: "Diff ID, URL, or owner/repo#number" } as const;

const list = defineCommand({
	meta: { name: "list", description: "List diffs known to Trellis" },
	args: {
		project: { type: "string", description: "Project reference" },
		ticket: { type: "string", description: "Ticket reference" },
		state: { type: "enum", options: ["ready", "not-ready"], description: "Local review state" },
		"external-state": { type: "enum", options: ["open", "closed", "merged"], description: "GitHub state" },
		limit: { type: "string", default: "50", description: "Maximum records" },
		all: { type: "boolean", description: "Every matching record" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const args = context.args;
		if (!/^[1-9][0-9]*$/.test(args.limit)) throw usageError("--limit requires a positive integer");
		const linked =
			args.ticket === undefined
				? null
				: new Set((await client.pullRequests.list({ ticket: args.ticket })).map((row) => row.id));
		const found = (
			await client.reviews.prs({ ...(args.project === undefined ? {} : { project: args.project }), all: true })
		).filter(
			(row) =>
				(linked === null || linked.has(row.id)) &&
				(args.state === undefined || row.localState === args.state) &&
				(args["external-state"] === undefined || row.state === args["external-state"]),
		);
		printList(ctx.out, ctx.format, args.all ? found : found.slice(0, Number(args.limit)), {
			identifier: (row) => row.id,
			columns: [
				{ name: "DIFF", value: (row) => `${row.owner}/${row.repo}#${row.number}` },
				{ name: "TITLE", value: (row) => row.title },
				{ name: "LOCAL", value: (row) => row.localState },
				{ name: "EXTERNAL", value: (row) => row.state },
				{ name: "CI", value: (row) => row.ciState },
			],
		});
	},
});

const link = defineCommand({
	meta: { name: "link", description: "Link a GitHub pull request to a ticket" },
	args: {
		diff: { type: "positional", required: true, description: "GitHub pull request URL" },
		ticket: { type: "string", required: true, description: "Ticket reference" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const row = await clientOf(ctx).pullRequests.link({ ticket: context.args.ticket, url: context.args.diff });
		ctx.out.write(ctx.format.mode === "quiet" ? `${row.id}\n` : json(row));
		if (row.fetchError === null) return 0;
		ctx.err.write(`GitHub could not refresh the linked diff: ${row.fetchError}\n`);
		return 6;
	},
});

const unlink = defineCommand({
	meta: { name: "unlink", description: "Remove a diff from one ticket" },
	args: { diff: ref, ticket: { type: "string", required: true, description: "Ticket reference" } },
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const ref = await resolvePullRequest(client, context.args.diff, false);
		ctx.out.write(json(await client.pullRequests.unlink({ ticket: context.args.ticket, id: ref.id })));
	},
});

const read = (operation: "show" | "refresh" | "patch") =>
	defineCommand({
		meta: {
			name: operation,
			description: operation === "patch" ? "Print the code patch" : "Read the diff and its review state",
		},
		args: { diff: ref },
		async run(context) {
			const ctx = contextOf(context);
			const client = clientOf(ctx);
			const ref = await resolvePullRequest(client, context.args.diff, true);
			if (operation === "patch") {
				const result = await client.pullRequests.diff({ id: ref.id });
				ctx.out.write(wantsJson(ctx) ? json(result) : result.diff);
				if (result.truncated) ctx.err.write(`The patch has a 1 MB limit. Read the complete change at ${result.url}\n`);
				return;
			}
			ctx.out.write(json(await client.pullRequests.refresh({ id: ref.id })));
		},
	});

export const records = { list, link, unlink, show: read("show"), refresh: read("refresh"), patch: read("patch") };
