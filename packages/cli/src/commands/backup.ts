import { mkdirSync, renameSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { BackupOutput } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { contextOf } from "../context.ts";
import { printRecord, type RecordSpec } from "../output.ts";

const backupRecord: RecordSpec<BackupOutput> = {
	fields: [
		{ name: "path", value: (row) => row.path },
		{ name: "bytes", value: (row) => String(row.bytes) },
	],
	identifier: (row) => row.path,
};

export default defineCommand({
	meta: { name: "backup", description: "Write a backup archive" },
	args: { dest: { type: "positional", required: false, description: "Archive destination" } },
	async run(context) {
		const ctx = contextOf(context);
		const result = await clientOf(ctx).system.backup();
		let backup = result;
		if (context.args.dest !== undefined) {
			const path = resolve(context.args.dest);
			mkdirSync(dirname(path), { recursive: true });
			renameSync(result.path, path);
			backup = { path, bytes: statSync(path).size };
		}
		printRecord(ctx.out, ctx.format, backup, backupRecord);
	},
});
