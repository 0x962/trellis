import type { Health } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { contextOf } from "../context.ts";
import { ghBanner } from "../errors.ts";
import { printRecord, type RecordSpec } from "../output.ts";

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

const healthRecord: RecordSpec<Health> = {
	fields: [
		{ name: "ok", value: (row) => String(row.ok) },
		{ name: "version", value: (row) => row.version },
		{ name: "apiVersion", value: (row) => row.apiVersion },
		{ name: "bootId", value: (row) => row.bootId },
		{ name: "rss", value: (row) => megabytes(row.rss) },
		{ name: "db", value: (row) => `${row.db.ok ? "ok" : "failed"}, ${megabytes(row.db.sizeBytes)}` },
		{ name: "gh", value: (row) => (row.gh.ok ? `ok, ${row.gh.user}` : ghBanner(row.gh)) },
	],
	identifier: (row) => row.bootId,
};

export default defineCommand({
	meta: { name: "status", description: "Show server health" },
	async run(context) {
		const ctx = contextOf(context);
		const health = await clientOf(ctx).system.health();
		printRecord(ctx.out, ctx.format, health, healthRecord);
	},
});
