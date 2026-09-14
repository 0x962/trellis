import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { contextOf } from "../context.ts";
import { json } from "../output.ts";

const project = {
	type: "positional",
	required: true,
	description: "Selected project reference; descendant blockers appear in the preview",
} as const;
const expectedVersion = {
	type: "string",
	required: true,
	description: "Version from the current inventory preview",
} as const;
const inventory = defineCommand({
	meta: { description: "Preview configurations, agents, deliveries, checks, flows, and migration blockers" },
	args: { project },
	async run(context) {
		const ctx = contextOf(context);
		ctx.out.write(json(await clientOf(ctx).nativeMigration.inventory({ project: context.args.project })));
	},
});
const apply = defineCommand({
	meta: {
		description:
			"Change one inactive project to paused, untrusted local execution. Reuse the request UUID after a lost response.",
	},
	args: {
		project,
		"expected-version": expectedVersion,
		directory: { type: "string", required: true, description: "Absolute repository path" },
		"request-id": { type: "string", required: true, description: "Stable UUID for this exact migration request" },
	},
	async run(context) {
		const ctx = contextOf(context);
		ctx.out.write(
			json(
				await clientOf(ctx).nativeMigration.apply({
					project: context.args.project,
					directory: context.args.directory,
					expectedVersion: context.args["expected-version"],
					requestId: context.args["request-id"],
				}),
			),
		);
	},
});
const rollback = defineCommand({
	meta: {
		description:
			"Restore the prior configuration and preserve all work. Reuse the original version after a lost response.",
	},
	args: {
		migration: { type: "positional", required: true, description: "Migration ID" },
		"expected-version": expectedVersion,
	},
	async run(context) {
		const ctx = contextOf(context);
		ctx.out.write(
			json(
				await clientOf(ctx).nativeMigration.rollback({
					migrationId: context.args.migration,
					expectedVersion: context.args["expected-version"],
				}),
			),
		);
	},
});
export default defineCommand({
	meta: {
		name: "native-migration",
		description: "Preview, apply, or roll back a project migration to local execution",
	},
	subCommands: { inventory, apply, rollback },
});
