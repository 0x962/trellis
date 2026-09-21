import type { Session } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { contextOf } from "../context.ts";
import { usageError } from "../errors.ts";
import { cell, printRecord, type RecordSpec } from "../output.ts";

const sessionRecord: RecordSpec<Session> = {
	fields: [
		{ name: "id", value: (row) => row.id },
		{ name: "name", value: (row) => row.name },
		{ name: "project", value: (row) => cell(row.projectPath) },
		{ name: "directory", value: (row) => row.directory },
		{ name: "run", value: (row) => row.runId },
		{ name: "created", value: (row) => row.createdAt },
		{ name: "updated", value: (row) => row.updatedAt },
	],
	identifier: (row) => row.id,
};

const move = defineCommand({
	meta: { name: "move", description: "Move a session to a project, or detach it from projects" },
	args: {
		session: { type: "positional", required: true, description: "Session ID" },
		project: { type: "string", description: "Project ref" },
		"no-project": { type: "boolean", description: "Detach the session from projects" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const project = typeof args.project === "string" ? args.project : undefined;
		const noProject = context.rawArgs.includes("--no-project");
		const targets = Number(project !== undefined) + Number(noProject);
		if (targets !== 1) throw usageError("Pass exactly one of --project or --no-project");
		const session = await clientOf(ctx).sessions.move({
			id: args.session,
			project: noProject ? null : project!,
		});
		printRecord(ctx.out, ctx.format, session, sessionRecord);
	},
});

export default defineCommand({
	meta: { name: "sessions", description: "Move sessions between projects" },
	subCommands: { move },
});
