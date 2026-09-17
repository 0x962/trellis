import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { contextOf } from "../context.ts";
import { usageError } from "../errors.ts";
import { json } from "../output.ts";

const run = { type: "positional", required: true, description: "Native agent run ID" } as const;
const path = { type: "string", required: true, description: "File path relative to the agent workspace" } as const;
const list = defineCommand({
	meta: { description: "List checks, artifacts, and current review readiness" },
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
const check = defineCommand({
	meta: {
		description:
			"Run a check with explicit argv. Reuse its UUID to retrieve the same record; use a new UUID to run again.",
	},
	args: {
		run,
		command: { type: "string", required: true, description: "Executable name or path" },
		args: { type: "string", default: "[]", description: "JSON array of strings, passed unchanged as argv" },
		"timeout-ms": { type: "string", default: "60000", description: "Process timeout in milliseconds (100 to 600000)" },
		"request-id": {
			type: "string",
			required: true,
			description: "Stable UUID for this check; reuse it after a lost response",
		},
	},
	async run(context) {
		const ctx = contextOf(context);
		let args: unknown;
		try {
			args = JSON.parse(context.args.args);
		} catch {
			throw usageError("--args must be a JSON array of strings");
		}
		if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string"))
			throw usageError("--args must be a JSON array of strings");
		const input = {
			runId: context.args.run,
			command: context.args.command,
			args,
			requestId: context.args["request-id"],
			timeoutMs: Number(context.args["timeout-ms"]),
		};
		const result = await clientOf(ctx).evidence.check(input);
		ctx.out.write(json(result));
		// A check counts only while it stays current. A restart of the agent
		// starts a new attempt and drops `current`, so a passed check of the
		// previous attempt also prints the reason and exits 6.
		if (result.state === "passed" && result.current) return 0;
		const stale = result.current ? "" : " and not current";
		ctx.err.write(`warning: the check is ${result.state}${stale}: ${result.error ?? "no error text"}\n`);
		return 6;
	},
});

export default defineCommand({
	meta: { name: "evidence", description: "Inspect native work and record checks and artifacts" },
	subCommands: { list, workspace, file, register, check },
});
