import type { FlowExecutionRecord, FlowSummary } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { type CliContext, contextOf, wantsJson } from "../../context.ts";
import { notFound, usageError } from "../../errors.ts";
import { cell, json, printList } from "../../output.ts";
import { currentHead, resolvePullRequest } from "../pullRequestRef.ts";
import { flowRunEnded, flowRunText } from "./flowText.ts";

const ref = { type: "positional", required: true, description: "Pull request number, URL, or owner/repo#123" } as const;

// The pull request a flow runs against, with the ticket that links it and
// the commit it points at now. A flow runs against a ticket, so a pull
// request that no ticket links can start none.
const flowTarget = async (client: TrellisClient, input: string) => {
	const resolved = await resolvePullRequest(client, input, true);
	const head = await currentHead(client, resolved);
	if (head.ticket === null)
		throw usageError(`no ticket links pull request ${input}; link it first: trellis pr add <ticket> ${resolved.url}`);
	return { ticket: head.ticket, headSha: head.sha, number: head.pullRequest.number };
};

// A flow ref is its slug, its ULID, or its name. `flowExecutions.start` asks
// for the version the caller saw, so the caller reads the list first.
const pickFlow = (flows: FlowSummary[], input: string): FlowSummary => {
	const lower = input.toLowerCase();
	const found = flows.find(
		(flow) => flow.slug === lower || flow.id === input.toUpperCase() || flow.name.toLowerCase() === lower,
	);
	if (found === undefined) throw notFound("flow", input);
	return found;
};

const list = defineCommand({
	meta: { name: "list", description: "List the flows with the description that says what each one is for" },
	args: {},
	async run(context) {
		const ctx = contextOf(context);
		const flows = await clientOf(ctx).flows.list({});
		printList(ctx.out, ctx.format, flows, {
			identifier: (flow) => flow.slug,
			columns: [
				{ name: "SLUG", value: (flow) => flow.slug },
				{ name: "NAME", value: (flow) => flow.name },
				{ name: "STEPS", value: (flow) => String(flow.nodeCount) },
				{ name: "DESCRIPTION", value: (flow) => cell(flow.description) },
			],
		});
	},
});

// Reads the run every `pollMs` until it ends or `deadline` passes.
const pollMs = 5000;
const watch = async (
	ctx: CliContext,
	client: TrellisClient,
	run: FlowExecutionRecord,
	deadline: number,
): Promise<FlowExecutionRecord> => {
	let latest = run;
	while (!flowRunEnded(latest) && ctx.deps.now().getTime() < deadline) {
		await ctx.deps.sleep(pollMs);
		latest = await client.flowExecutions.get({ id: latest.id });
	}
	return latest;
};

const run = defineCommand({
	meta: { name: "run", description: "Start a flow on a pull request and wait for its result" },
	args: {
		ref,
		flow: { type: "string", required: true, description: "Flow slug, name, or ULID, as trellis flows list prints it" },
		wait: {
			type: "boolean",
			default: true,
			description: "Wait for the run to end; --no-wait prints the run id to poll",
		},
		timeout: { type: "string", valueHint: "minutes", description: "Stop waiting after this many minutes (default 60)" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const minutes = context.args.timeout === undefined ? 60 : Number(context.args.timeout);
		if (!Number.isFinite(minutes) || minutes <= 0) throw usageError("--timeout takes a number of minutes above zero");
		const target = await flowTarget(client, context.args.ref);
		const flow = pickFlow(await client.flows.list({}), context.args.flow);
		const started = await client.flowExecutions.start({
			flow: flow.slug,
			ticket: target.ticket,
			headSha: target.headSha,
			requestId: crypto.randomUUID(),
			expectedVersion: flow.version,
		});
		const deadline = ctx.deps.now().getTime() + minutes * 60_000;
		const finished = context.args.wait ? await watch(ctx, client, started, deadline) : started;
		if (wantsJson(ctx)) {
			ctx.out.write(json(finished));
		} else {
			ctx.out.write(
				`Started the ${flow.name} flow on #${target.number} at head ${target.headSha}. Run ${finished.id}\n`,
			);
			ctx.out.write(flowRunText(finished, target.number));
		}
		return finished.state.status === "succeeded" || !context.args.wait ? 0 : 1;
	},
});

const runs = defineCommand({
	meta: { name: "runs", description: "List the flow runs of the ticket that links a pull request" },
	args: { ref },
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const target = await flowTarget(client, context.args.ref);
		const found = await client.flowExecutions.list({ ticket: target.ticket });
		printList(ctx.out, ctx.format, found, {
			identifier: (record) => record.id,
			columns: [
				{ name: "RUN", value: (record) => record.id },
				{ name: "FLOW", value: (record) => record.doc.flow.name },
				{ name: "STATUS", value: (record) => record.state.status },
				{ name: "HEAD", value: (record) => cell(record.headSha) },
				{ name: "STARTED", value: (record) => record.createdAt },
			],
		});
	},
});

export default defineCommand({
	meta: { name: "flows", description: "List flows, run one on a pull request, and list the runs" },
	subCommands: { list, run, runs },
});
