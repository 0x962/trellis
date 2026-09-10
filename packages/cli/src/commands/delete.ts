import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf } from "../context.ts";
import { usageError } from "../errors.ts";
import { printRecord, type RecordSpec } from "../output.ts";

export const deletedRecord: RecordSpec<{ deleted: string }> = {
	fields: [{ name: "deleted", value: (row) => row.deleted }],
	identifier: (row) => row.deleted,
};

export default defineCommand({
	meta: { name: "delete", description: "Delete a ticket" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		yes: { type: "boolean", description: "Confirm the delete" },
		force: { type: "boolean", description: "Let an agent delete" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		if (args.yes !== true) throw usageError("delete needs --yes; a deleted ticket cannot be restored");
		const result = await clientOf(ctx).tickets.delete(
			compact({ ticket: args.ticket, force: args.force === true ? true : undefined }),
		);
		printRecord(ctx.out, ctx.format, result, deletedRecord);
	},
});
