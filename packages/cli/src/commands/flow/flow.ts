import { type ArgsDef, defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { alias } from "../../commandTree/alias.ts";
import { contextOf } from "../../context.ts";
import { cell, json, printList, timeCell } from "../../output.ts";
import { resolvePullRequest } from "../pullRequestRef.ts";
import { listRuns } from "./listRuns.ts";
import { readRun } from "./readRun/readRun.ts";
import { readV1 } from "./readV1/readV1.ts";
import { runProgress } from "./runProgress/runProgress.ts";

const start = async () => {
	const command = await alias("flows", ["run"])();
	const { ref: _ref, flow: _flow, ...args } = command.args as ArgsDef;
	return {
		...command,
		meta: { name: "start", description: "Start a flow once for a diff, or read its existing run" },
		args: {
			flow: { type: "positional", required: true, description: "Flow ID, slug, or name" },
			diff: { type: "string", required: true, description: "Diff ID, URL, or owner/repo#number" },
			...args,
		} satisfies ArgsDef,
		run: (context: Parameters<NonNullable<typeof command.run>>[0]) =>
			command.run!({
				...context,
				args: { ...context.args, ref: context.args.diff! } as unknown as typeof context.args,
			}),
	};
};

const list = defineCommand({
	meta: { name: "list", description: "List saved flow runs across head commits" },
	args: {
		diff: { type: "string", description: "Keep runs for this diff" },
		flow: { type: "string", description: "Keep runs of this flow" },
		ticket: { type: "string", description: "Keep runs for this ticket" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const diff = context.args.diff === undefined ? null : await resolvePullRequest(client, context.args.diff, false);
		const found = await listRuns(client, {
			...(diff === null ? {} : { diffId: diff.id }),
			...(context.args.flow === undefined ? {} : { flow: context.args.flow }),
			...(context.args.ticket === undefined ? {} : { ticket: context.args.ticket }),
		});
		printList(ctx.out, ctx.format, found, {
			identifier: (row) => row.id,
			columns: [
				{ name: "RUN", value: (row) => row.id },
				{ name: "FLOW", value: (row) => runProgress(row).name },
				{ name: "DIFF", value: (row) => cell(row.diffId) },
				{ name: "STATE", value: (row) => runProgress(row).status },
				{ name: "HEAD", value: (row) => cell(runProgress(row).head) },
				{ name: "STARTED", value: (row) => timeCell(row.createdAt) },
			],
		});
	},
});

const document = defineCommand({
	meta: { name: "show", description: "Read a flow document in version 1 format" },
	args: { flow: { type: "positional", required: true, description: "Flow ID, slug, or name" } },
	async run(context) {
		const ctx = contextOf(context);
		const value = await clientOf(ctx).flowDocumentsV1.get({ flow: context.args.flow });
		ctx.out.write(json(readV1.document(value)));
	},
});

const show = defineCommand({
	meta: { name: "show", description: "Read a saved run and its step results" },
	args: { id: { type: "positional", required: true, description: "Flow run ID" } },
	async run(context) {
		const ctx = contextOf(context);
		ctx.out.write(json(await readRun(clientOf(ctx), context.args.id)));
	},
});

export default defineCommand({
	meta: { name: "flow", description: "Start flows and inspect their saved runs" },
	subCommands: {
		list: alias("flows", ["list"]),
		document: defineCommand({
			meta: { name: "document", description: "Read versioned flow documents" },
			subCommands: { show: document },
		}),
		start,
		run: defineCommand({ meta: { name: "run", description: "Read saved flow runs" }, subCommands: { list, show } }),
	},
});
