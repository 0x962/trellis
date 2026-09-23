import { type AgentRun, HarnessSchema } from "@trellis/api";
import { shortZonedDateTime } from "@trellis/api/time";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, readText, wantsJson } from "../context.ts";
import { cell, json, type ListSpec, printList, printRecord, type RecordSpec } from "../output.ts";

const agentList: ListSpec<AgentRun> = {
	columns: [
		{ name: "id", value: (row) => row.id },
		{ name: "kind", value: (row) => row.kind },
		{ name: "name", value: (row) => cell(row.name) },
		{ name: "state", value: (row) => row.state },
		{ name: "ticket", value: (row) => cell(row.ticketIdentifier) },
		{ name: "updated", value: (row) => shortZonedDateTime(row.updatedAt) },
	],
	identifier: (row) => row.id,
};

const agentRecord: RecordSpec<AgentRun> = {
	fields: [
		{ name: "id", value: (row) => row.id },
		{ name: "kind", value: (row) => row.kind },
		{ name: "name", value: (row) => cell(row.name) },
		{ name: "state", value: (row) => row.state },
		{ name: "account", value: (row) => cell(row.accountId) },
		{ name: "runtime", value: (row) => row.runtime },
		{ name: "project", value: (row) => cell(row.projectKey) },
		{ name: "ticket", value: (row) => cell(row.ticketIdentifier) },
		{ name: "url", value: (row) => cell(row.url) },
		{ name: "error", value: (row) => cell(row.error) },
		{ name: "created", value: (row) => shortZonedDateTime(row.createdAt) },
		{ name: "updated", value: (row) => shortZonedDateTime(row.updatedAt) },
	],
	identifier: (row) => row.id,
};

const list = defineCommand({
	meta: { name: "list", description: "List agents by ticket or by project" },
	args: {
		ticket: { type: "string", description: "Keep the agents of this ticket" },
		project: { type: "string", description: "Keep the agents of this project" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const rows = await clientOf(ctx).agentRuns.list(compact({ ticket: args.ticket, project: args.project }));
		printList(ctx.out, ctx.format, rows, agentList);
	},
});

const start = defineCommand({
	meta: { name: "start", description: "Assign an agent to a ticket" },
	args: {
		ticket: { type: "string", required: true, description: "Ticket ref" },
		harness: { type: "string", description: "Harness preset for a ticket agent" },
		"request-id": { type: "string", description: "Stable assignment ID to prevent a duplicate start" },
		account: { type: "string", description: "Account ID from trellis accounts list" },
		model: { type: "string", description: "Canonical model ID from trellis models list for this assignment" },
		effort: { type: "string", description: "Reasoning effort for this assignment" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const harness = args.harness
			? HarnessSchema.parse({ preset: args.harness, model: args.model, effort: args.effort })
			: undefined;
		const run = await clientOf(ctx).agentRuns.start(
			compact({
				harness,
				accountId: args.account,
				requestId: args["request-id"],
				ticket: args.ticket,
			}),
		);
		printRecord(ctx.out, ctx.format, run, agentRecord);
		// A start answers a row in any state. Only `running` means the
		// terminal is up, so every other state prints the reason and exits 6.
		if (run.state === "running") return 0;
		ctx.err.write(`warning: the agent is ${run.state}: ${run.error ?? "no error text"}\n`);
		return 6;
	},
});

const resume = defineCommand({
	meta: { name: "resume", description: "Resume a stopped assignment in its existing conversation" },
	args: {
		id: { type: "positional", required: true, description: "Agent ID" },
		account: { type: "string", description: "Account ID for the same harness" },
		model: { type: "string", description: "Canonical model ID from trellis models list for this resume" },
		"expected-terminal-id": { type: "string", required: true, description: "Stopped attempt ID from the agent record" },
		"request-id": { type: "string", required: true, description: "Stable request ID for this resume" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const result = await clientOf(ctx).agentRuns.resume(
			compact({
				id: args.id,
				model: args.model,
				accountId: args.account,
				expectedTerminalId: args["expected-terminal-id"],
				requestId: args["request-id"],
			}),
		);
		printRecord(ctx.out, ctx.format, result, agentRecord);
		// A resume answers a row in any state, like a start. Only `running`
		// means the terminal is up, so every other state prints the reason and
		// exits 6.
		if (result.state === "running") return 0;
		ctx.err.write(`warning: the agent is ${result.state}: ${result.error ?? "no error text"}\n`);
		return 6;
	},
});

const account = defineCommand({
	meta: {
		name: "account",
		description: "Switch accounts, interrupt the active turn, and resume the same conversation",
	},
	args: {
		id: { type: "positional", required: true, description: "Agent ID" },
		account: { type: "string", required: true, description: "Account ID for the same harness" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const [run] = await client.agentRuns.list({ ids: [context.args.id] });
		if (!run?.terminalId) throw new Error("This run has no provider session to resume.");
		const result = await client.agentRuns.switchAccount({
			id: run.id,
			accountId: context.args.account,
			expectedTerminalId: run.terminalId,
			requestId: crypto.randomUUID(),
			confirmInterrupt: true,
		});
		printRecord(ctx.out, ctx.format, result, agentRecord);
		return result.state === "running" ? 0 : 6;
	},
});

const model = defineCommand({
	meta: { name: "model", description: "Change a running agent's model and continue its conversation" },
	args: {
		id: { type: "positional", required: true, description: "Agent ID" },
		model: { type: "string", required: true, description: "Canonical model ID from trellis models list" },
		"expected-terminal-id": { type: "string", required: true, description: "Current attempt ID from the agent record" },
		"request-id": { type: "string", required: true, description: "Stable request ID for this model change" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const result = await clientOf(ctx).agentRuns.setModel({
			id: args.id,
			model: args.model,
			expectedTerminalId: args["expected-terminal-id"],
			requestId: args["request-id"],
		});
		printRecord(ctx.out, ctx.format, result, agentRecord);
		return result.state === "running" ? 0 : 6;
	},
});

const refresh = defineCommand({
	meta: { name: "refresh", description: "Read the terminal and update the state" },
	args: { id: { type: "positional", required: true, description: "Agent id" } },
	async run(context) {
		const ctx = contextOf(context);
		const run = await clientOf(ctx).agentRuns.refresh({ id: context.args.id });
		printRecord(ctx.out, ctx.format, run, agentRecord);
	},
});

const stop = defineCommand({
	meta: { name: "stop", description: "Stop the terminal and keep the workspace and the output" },
	args: { id: { type: "positional", required: true, description: "Agent id" } },
	async run(context) {
		const ctx = contextOf(context);
		const run = await clientOf(ctx).agentRuns.stop({ id: context.args.id });
		printRecord(ctx.out, ctx.format, run, agentRecord);
	},
});

const interrupt = defineCommand({
	meta: { name: "interrupt", description: "Interrupt the current turn and keep the agent session" },
	args: { id: { type: "positional", required: true, description: "Agent id" } },
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).agentRuns.interrupt({ id: context.args.id });
		ctx.out.write(wantsJson(ctx) ? json(result) : "Interrupted the current turn.\n");
	},
});

const send = defineCommand({
	meta: { name: "send", description: "Send an agent a follow-up" },
	args: {
		id: { type: "positional", required: true, description: "Agent id" },
		text: { type: "string", required: true, description: "Follow-up text, or - for stdin" },
		interrupt: { type: "boolean", default: false, description: "Stop the current turn before the message" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const run = await clientOf(ctx).agentRuns.send({
			id: args.id,
			text: await readText(ctx, args.text),
			...(args.interrupt ? { interrupt: true } : {}),
		});
		printRecord(ctx.out, ctx.format, run, agentRecord);
	},
});

// Terminal text prints verbatim on a TTY and on a pipe.
const output = defineCommand({
	meta: { name: "output", description: "Print the terminal output of an agent" },
	args: { id: { type: "positional", required: true, description: "Agent id" } },
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).agentRuns.output({ id: context.args.id });
		if (wantsJson(ctx)) {
			ctx.out.write(json(result));
			return;
		}
		ctx.out.write(result.text);
	},
});

export default defineCommand({
	meta: { name: "agents", description: "List, start, refresh, interrupt, stop, or talk to agents" },
	subCommands: { list, start, resume, model, account, refresh, interrupt, stop, send, output },
});
