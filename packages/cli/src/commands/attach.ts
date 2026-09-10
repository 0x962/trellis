import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Attachment, AttachmentUploadOutput } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf } from "../context.ts";
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

const renderUpload = (result: AttachmentUploadOutput) =>
	`Attached ${result.attachment.filename} (${kilobytes(result.attachment.size)}) -> ${result.url}\n${result.markdown}\n`;

export default defineCommand({
	meta: { name: "attach", description: "Upload a file to a ticket" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		path: { type: "positional", required: true, description: "File path" },
		name: { type: "string", description: "Filename to store instead of the file's own" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const file = new File([readFileSync(args.path)], basename(args.path));
		const result = await clientOf(ctx).attachments.upload(compact({ ticket: args.ticket, file, name: args.name }));
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
