import {
	type Session,
	type SessionDetail,
	type SessionUpdate,
	type SessionUpdates,
	sessionStatus,
	sessionStatusLabels,
} from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf } from "../context.ts";
import { usageError } from "../errors.ts";
import { cell, type ListSpec, printList, printRecord, type RecordSpec, timeCell } from "../output.ts";
import { sessionUpdateInput } from "./sessionUpdateInput.ts";

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

const updateRecord: RecordSpec<SessionUpdate> = {
	fields: [
		{ name: "id", value: (row) => row.id },
		{ name: "session", value: (row) => row.sessionId },
		{ name: "run", value: (row) => row.runId },
		{ name: "request", value: (row) => cell(row.requestId) },
		{ name: "created", value: (row) => row.createdAt },
		{ name: "embeds", value: (row) => String(row.embeds.length) },
		{ name: "body", value: (row) => row.body },
	],
	identifier: (row) => row.id,
};

const updatesRecord: RecordSpec<SessionUpdates> = {
	fields: [
		{ name: "latest", value: (row) => cell(row.latest?.id) },
		{ name: "latest at", value: (row) => cell(row.latest?.createdAt) },
		{ name: "latest body", value: (row) => cell(row.latest?.body) },
		{ name: "previous", value: (row) => cell(row.previous?.id) },
		{ name: "previous at", value: (row) => cell(row.previous?.createdAt) },
		{ name: "previous body", value: (row) => cell(row.previous?.body) },
		{ name: "request", value: (row) => cell(row.request?.requestId) },
		{ name: "requested", value: (row) => cell(row.request?.requestedAt) },
		{ name: "request state", value: (row) => cell(row.request?.state) },
		{ name: "request error", value: (row) => cell(row.request?.error) },
	],
	identifier: (row) => row.latest?.id ?? row.request?.requestId ?? "none",
};

const list = defineCommand({
	meta: { name: "list", description: "List sessions" },
	args: {
		archived: { type: "boolean", description: "List only the archived sessions" },
		active: { type: "boolean", description: "List only the sessions nobody archived" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		if (args.archived === true && args.active === true) throw usageError("Pass at most one of --archived or --active");
		// Without a flag the list holds both groups, and the archived column
		// says which group each row sits in.
		const archived = args.archived === true ? true : args.active === true ? false : undefined;
		printList(ctx.out, ctx.format, await clientOf(ctx).sessions.activity(compact({ archived })), sessionList);
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

const statusRead = defineCommand({
	meta: { name: "read", description: "Read the latest and previous status updates of a session" },
	args: { session: { type: "positional", required: true, description: "Session id, run id, or name" } },
	async run(context) {
		const ctx = contextOf(context);
		const updates = await clientOf(ctx).sessionUpdates.get({ sessionId: context.args.session });
		printRecord(ctx.out, ctx.format, updates, updatesRecord);
	},
});

const statusWrite = defineCommand({
	meta: { name: "write", description: "Save a rich status update for the current agent session" },
	args: {
		session: { type: "positional", required: true, description: "Session id, run id, or name" },
		body: { type: "string", required: true, description: "Markdown body, or - for standard input" },
		"request-id": { type: "string", description: "Status request ID from Trellis" },
		embed: { type: "string", description: "Comma-separated HTML file paths" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const update = await clientOf(ctx).sessionUpdates.write(
			await sessionUpdateInput(ctx, {
				session: context.args.session,
				body: context.args.body,
				requestId: context.args["request-id"],
				embed: context.args.embed,
			}),
		);
		printRecord(ctx.out, ctx.format, update, updateRecord);
	},
});

const status = defineCommand({
	meta: { name: "status", description: "Read or write rich status updates" },
	subCommands: { read: statusRead, write: statusWrite },
});

export default defineCommand({
	meta: { name: "sessions", description: "List, move, rename, and archive sessions" },
	subCommands: { list, move, rename, archive, unarchive, status },
});
