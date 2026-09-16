import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf } from "../context.ts";
import { usageError } from "../errors.ts";
import { json } from "../output.ts";

const list = defineCommand({
	meta: { description: "Read manager dispatches and recorded coordination outcomes" },
	args: {
		project: { type: "string", description: "Project ref" },
		unhandled: { type: "boolean", description: "Show coordination that has no complete outcome" },
		before: { type: "string", description: "Read the next page before this dispatch ID" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const project = context.args.project ? await client.projects.get({ project: context.args.project }) : undefined;
		ctx.out.write(
			json(
				await client.controller.list(
					compact({ projectId: project?.id, unhandled: context.args.unhandled, before: context.args.before }),
				),
			),
		);
	},
});
const handle = defineCommand({
	meta: { description: "Record per-ticket outcomes for a manager dispatch" },
	args: {
		dispatch: { type: "positional", required: true, description: "Dispatch ID" },
		generation: { type: "string", required: true, description: "Dispatch generation" },
		outcomes: {
			type: "string",
			required: true,
			description: "JSON array: ticketId (null for empty heartbeat), status, reason, optional reference",
		},
	},
	async run(context) {
		const ctx = contextOf(context);
		let outcomes: unknown;
		try {
			outcomes = JSON.parse(context.args.outcomes);
		} catch {
			throw usageError("--outcomes must be a JSON array");
		}
		const client = clientOf(ctx);
		type Input = Parameters<typeof client.controller.handle>[0];
		ctx.out.write(
			json(
				await client.controller.handle({
					id: context.args.dispatch,
					generation: Number(context.args.generation),
					outcomes: outcomes as Input["outcomes"],
				}),
			),
		);
	},
});
const actions = defineCommand({
	meta: { description: "Read saved capacity waits" },
	args: {
		project: { type: "string", description: "Manager project ref" },
		before: { type: "string", description: "Read the next page before this action ID" },
		state: { type: "string", description: "waiting, assigned, or canceled" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const project = context.args.project ? await client.projects.get({ project: context.args.project }) : undefined;
		const state = context.args.state;
		if (state !== undefined && !["waiting", "assigned", "canceled"].includes(state))
			throw usageError("--state must be waiting, assigned, or canceled");
		ctx.out.write(
			json(
				await client.controller.actions(
					compact({
						projectId: project?.id,
						before: context.args.before,
						state: state as "waiting" | "assigned" | "canceled" | undefined,
					}),
				),
			),
		);
	},
});
const cancelAction = defineCommand({
	meta: { description: "Cancel a pending capacity wait" },
	args: { id: { type: "positional", required: true, description: "Next action ID" } },
	async run(context) {
		const ctx = contextOf(context);
		ctx.out.write(json(await clientOf(ctx).controller.cancelAction({ id: context.args.id })));
	},
});
export default defineCommand({
	meta: { name: "manager", description: "Read manager work and record coordination outcomes" },
	subCommands: { list, handle, actions, "cancel-action": cancelAction },
});
