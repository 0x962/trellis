import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { contextOf } from "../context.ts";
import { json } from "../output.ts";

const run = { type: "positional", required: true, description: "Native agent run ID" } as const;
const path = { type: "string", required: true, description: "File path relative to the agent workspace" } as const;
const list = defineCommand({
	meta: { description: "List historical checks and current artifacts" },
	args: { run },
	async run(context) {
		const ctx = contextOf(context);
		ctx.out.write(json(await clientOf(ctx).evidence.list({ runId: context.args.run })));
	},
});
const workspace = defineCommand({
	meta: { description: "Inspect workspace files, diff, and revision" },
	args: { run },
	async run(context) {
		const ctx = contextOf(context);
		ctx.out.write(json(await clientOf(ctx).evidence.workspace({ runId: context.args.run })));
	},
});
const file = defineCommand({
	meta: { description: "Read a file from the agent workspace" },
	args: { run, path },
	async run(context) {
		const ctx = contextOf(context);
		ctx.out.write(json(await clientOf(ctx).evidence.file({ runId: context.args.run, path: context.args.path })));
	},
});
const register = defineCommand({
	meta: { description: "Register a file as an artifact for the current revision" },
	args: { run, path },
	async run(context) {
		const ctx = contextOf(context);
		ctx.out.write(json(await clientOf(ctx).evidence.register({ runId: context.args.run, path: context.args.path })));
	},
});
export default defineCommand({
	meta: { name: "evidence", description: "Inspect native work and register artifacts" },
	subCommands: { list, workspace, file, register },
});
