import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Attachment, AttachmentUploadOutput } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf } from "../context.ts";
import { fileNotFound, fileUnreadable } from "../errors.ts";
import { json, type ListSpec, printList } from "../output.ts";

const attachmentList: ListSpec<Attachment> = {
	columns: [
		{ name: "id", value: (row) => row.id },
		{ name: "filename", value: (row) => row.filename },
		{ name: "size", value: (row) => kilobytes(row.size) },
		{ name: "url", value: (row) => row.url },
	],
	identifier: (row) => row.id,
};

const kilobytes = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

// The file the command line names. The file system is a boundary: a path
// the process cannot open ends the run with one line and no request.
const fileAt = (path: string): File => {
	try {
		return new File([readFileSync(path)], basename(path));
	} catch (error) {
		const failure = error as NodeJS.ErrnoException;
		if (failure.code === "ENOENT") throw fileNotFound(path);
		throw fileUnreadable(path, failure.message);
	}
};

// The server's multipart parser cuts a filename at a double quote or a line
// break. Such a name also travels in the `name` field, which the server
// stores in place of the multipart filename.
const CUT_BY_MULTIPART = /["\r\n]/;

export const renderUpload = (result: AttachmentUploadOutput) =>
	`Attached ${result.attachment.filename} (${kilobytes(result.attachment.size)}) -> ${result.url}\n${result.markdown}\n`;

// The file at a path with the name the server stores. `comment --attach`
// shares it, so one flag uploads the same way in both commands.
export const fileForUpload = (path: string, name?: string): { file: File; name?: string } => {
	const file = fileAt(path);
	const stored = name ?? (CUT_BY_MULTIPART.test(file.name) ? file.name : undefined);
	return compact({ file, name: stored });
};

export default defineCommand({
	meta: { name: "attach", description: "Upload a file to a ticket" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		path: { type: "positional", required: true, description: "File path" },
		name: { type: "string", description: "Filename to store instead of the file's own" },
		comment: { type: "string", description: "Comment ID to link the upload to" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const result = await clientOf(ctx).attachments.upload({
			ticket: args.ticket,
			...fileForUpload(args.path, args.name),
			...(args.comment === undefined ? {} : { commentId: args.comment }),
		});
		switch (ctx.format.mode) {
			case "quiet":
				ctx.out.write(`${result.attachment.id}\n`);
				return;
			case "json":
			case "jsonl":
				ctx.out.write(json(result));
				return;
			case "table":
				ctx.out.write(renderUpload(result));
				return;
		}
	},
});

export const attachments = defineCommand({
	meta: { name: "attachments", description: "List the attachments of a ticket" },
	args: { ticket: { type: "positional", required: true, description: "Ticket ref" } },
	async run(context) {
		const ctx = contextOf(context);
		const rows = await clientOf(ctx).attachments.list({ ticket: context.args.ticket });
		printList(ctx.out, ctx.format, rows, attachmentList);
	},
});
