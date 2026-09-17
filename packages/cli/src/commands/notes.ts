import type { Note, NoteAudience } from "@trellis/api";
import { shortZonedDateTime } from "@trellis/api/time";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf, noneToNull, readText } from "../context.ts";
import { usageError } from "../errors.ts";
import { cell, type ListSpec, printList, printRecord, type RecordSpec, timeCell } from "../output.ts";

const audiences: NoteAudience[] = ["all", "manager", "worker"];

const projectArg = { type: "positional" as const, required: true as const, description: "Project ref, such as TRL" };
const idArg = { type: "positional" as const, required: true as const, description: "Note id" };
const audienceArg = { type: "string" as const, description: `Who reads the note: ${audiences.join(", ")}` };

const checkAudience = (value: string | undefined) => {
	if (value !== undefined && !audiences.includes(value as NoteAudience))
		throw usageError(`--audience takes one of ${audiences.join(", ")}, not "${value}"`);
	return value as NoteAudience | undefined;
};

// An agent actor is `agent:<run id>`. Its display name comes first.
const writer = (note: Note) =>
	note.actor.kind === "agent" && note.actor.displayName !== undefined
		? `${note.actor.kind}:${note.actor.displayName} ${note.actor.name}`
		: `${note.actor.kind}:${note.actor.name}`;

const noteList: ListSpec<Note> = {
	columns: [
		{ name: "id", value: (row) => row.id },
		{ name: "title", value: (row) => cell(row.title) },
		{ name: "audience", value: (row) => row.audience },
		{ name: "project", value: (row) => row.projectPath },
		{ name: "updated", value: (row) => shortZonedDateTime(row.updatedAt) },
		{ name: "expires", value: (row) => timeCell(row.expiresAt) },
	],
	identifier: (row) => row.id,
};

const noteRecord: RecordSpec<Note> = {
	fields: [
		{ name: "id", value: (row) => row.id },
		{ name: "project", value: (row) => row.projectPath },
		{ name: "title", value: (row) => cell(row.title) },
		{ name: "audience", value: (row) => row.audience },
		{ name: "expires", value: (row) => timeCell(row.expiresAt) },
		{ name: "actor", value: writer },
		{ name: "updated", value: (row) => shortZonedDateTime(row.updatedAt) },
		{ name: "body", value: (row) => cell(row.body) },
	],
	identifier: (row) => row.id,
};

const deletedRecord: RecordSpec<{ id: string }> = {
	fields: [{ name: "deleted", value: (row) => row.id }],
	identifier: (row) => row.id,
};

const list = defineCommand({
	meta: { name: "list", description: "List the notes of a project and its ancestors, newest change first" },
	args: {
		project: projectArg,
		audience: audienceArg,
		expired: { type: "boolean", description: "Include the notes whose expiry has passed" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const notes = await clientOf(ctx).notes.list(
			compact({
				project: args.project,
				audience: checkAudience(args.audience),
				includeExpired: args.expired === true ? true : undefined,
			}),
		);
		printList(ctx.out, ctx.format, notes, noteList);
	},
});

const show = defineCommand({
	meta: { name: "show", description: "Show one note" },
	args: { id: idArg },
	async run(context) {
		const ctx = contextOf(context);
		const note = await clientOf(ctx).notes.get({ id: context.args.id });
		printRecord(ctx.out, ctx.format, note, noteRecord);
	},
});

const add = defineCommand({
	meta: { name: "add", description: "Write a note on a project" },
	args: {
		project: projectArg,
		title: { type: "string", required: true, description: "Title, unique in the project" },
		body: { type: "string", required: true, description: "Markdown body, or - for stdin" },
		audience: audienceArg,
		expires: { type: "string", description: "ISO time after which the note leaves every read" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const note = await clientOf(ctx).notes.create(
			compact({
				project: args.project,
				title: args.title,
				body: await readText(ctx, args.body),
				audience: checkAudience(args.audience),
				expiresAt: args.expires,
			}),
		);
		printRecord(ctx.out, ctx.format, note, noteRecord);
	},
});

const edit = defineCommand({
	meta: { name: "edit", description: "Change the fields of a note that you pass" },
	args: {
		id: idArg,
		title: { type: "string", description: "New title" },
		body: { type: "string", description: "New markdown body, or - for stdin" },
		audience: audienceArg,
		expires: { type: "string", description: "New ISO expiry, or none to remove it" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const note = await clientOf(ctx).notes.update(
			compact({
				id: args.id,
				title: args.title,
				body: args.body === undefined ? undefined : await readText(ctx, args.body),
				audience: checkAudience(args.audience),
				expiresAt: noneToNull(args.expires),
			}),
		);
		printRecord(ctx.out, ctx.format, note, noteRecord);
	},
});

const rm = defineCommand({
	meta: { name: "rm", description: "Delete a note" },
	args: { id: idArg },
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).notes.delete({ id: context.args.id });
		printRecord(ctx.out, ctx.format, result, deletedRecord);
	},
});

export default defineCommand({
	meta: { name: "notes", description: "Read and write the notes of a project" },
	subCommands: { list, show, add, edit, rm },
});
