import { type Session, type SessionDetail, sessionStatus, sessionStatusLabels } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { contextOf } from "../context.ts";
import { usageError } from "../errors.ts";
import { cell, type ListSpec, printList, printRecord, type RecordSpec, timeCell } from "../output.ts";

const sessionRecord: RecordSpec<Session> = {
	fields: [
		{ name: "id", value: (row) => row.id },
		{ name: "name", value: (row) => row.name },
		{ name: "project", value: (row) => cell(row.projectKey) },
		{ name: "directory", value: (row) => row.directory },
		{ name: "run", value: (row) => row.runId },
		{ name: "archived", value: (row) => cell(row.archivedAt) },
		{ name: "created", value: (row) => row.createdAt },
		{ name: "updated", value: (row) => row.updatedAt },
	],
	identifier: (row) => row.id,
};

const activityAt = (row: SessionDetail) =>
	row.run.observation?.activity?.updatedAt ?? row.run.observation?.lastMessage?.at ?? row.run.updatedAt;

const sessionList: ListSpec<SessionDetail> = {
	columns: [
		{ name: "id", value: (row) => row.id },
		{ name: "name", value: (row) => row.name },
		{ name: "project", value: (row) => cell(row.projectKey) },
		{ name: "state", value: (row) => sessionStatusLabels[sessionStatus(row.run)] },
		{ name: "last activity", value: (row) => timeCell(activityAt(row)) },
		{ name: "archived", value: (row) => timeCell(row.archivedAt) },
	],
	identifier: (row) => row.id,
};

const list = defineCommand({
	meta: { name: "list", description: "List sessions" },
	async run(context) {
		const ctx = contextOf(context);
		printList(ctx.out, ctx.format, await clientOf(ctx).sessions.activity({}), sessionList);
	},
});

const move = defineCommand({
	meta: { name: "move", description: "Move a session to a project, or detach it from projects" },
	args: {
		session: { type: "positional", required: true, description: "Session id, run id, or name" },
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

const rename = defineCommand({
	meta: { name: "rename", description: "Rename a session" },
	args: {
		session: { type: "positional", required: true, description: "Session id, run id, or name" },
		name: { type: "positional", required: true, description: "New session name" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const session = await clientOf(ctx).sessions.rename({
			id: context.args.session,
			name: context.args.name,
		});
		printRecord(ctx.out, ctx.format, session, sessionRecord);
	},
});

const archiveCommand = (name: string, description: string, archived: boolean) =>
	defineCommand({
		meta: { name, description },
		args: {
			session: { type: "positional", required: true, description: "Session id, run id, or name" },
		},
		async run(context) {
			const ctx = contextOf(context);
			const session = await clientOf(ctx).sessions.setArchived({ id: context.args.session, archived });
			printRecord(ctx.out, ctx.format, session, sessionRecord);
		},
	});

const archive = archiveCommand("archive", "Archive a session, which stops its agent and keeps its files", true);
const unarchive = archiveCommand("unarchive", "Bring an archived session back to the session list", false);

export default defineCommand({
	meta: { name: "sessions", description: "List, move, rename, and archive sessions" },
	subCommands: { list, move, rename, archive, unarchive },
});
