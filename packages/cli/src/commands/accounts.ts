import type { HarnessAccount, HarnessAccountQuota } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { compact, contextOf } from "../context.ts";
import { cell, type ListSpec, printList, printRecord, type RecordSpec } from "../output.ts";
import { localDateTime } from "../time.ts";

const accountList: ListSpec<HarnessAccount> = {
	columns: [
		{ name: "id", value: (row) => row.id },
		{ name: "name", value: (row) => row.name },
		{ name: "harness", value: (row) => row.harness },
		{ name: "default", value: (row) => String(row.isDefault) },
		{ name: "enabled", value: (row) => String(row.enabled) },
		{ name: "profile", value: (row) => row.profilePath },
	],
	identifier: (row) => row.id,
};
const quotaRecord: RecordSpec<HarnessAccountQuota> = {
	fields: [
		{ name: "account", value: (row) => row.accountId },
		{ name: "status", value: (row) => row.status },
		{ name: "email", value: (row) => cell(row.email) },
		{ name: "plan", value: (row) => cell(row.plan) },
		{
			name: "quota",
			value: (row) =>
				row.windows
					.map(
						(window) =>
							`${window.label}: ${window.usedPercent}% used, resets ${window.resetsAt === null ? "unknown" : localDateTime(window.resetsAt)}`,
					)
					.join("; "),
		},
		{ name: "detail", value: (row) => cell(row.detail) },
		{ name: "checked", value: (row) => localDateTime(row.fetchedAt) },
	],
	identifier: (row) => row.accountId,
};
const list = defineCommand({
	meta: { name: "list", description: "List the harness accounts from Settings" },
	async run(context) {
		const ctx = contextOf(context);
		printList(ctx.out, ctx.format, await clientOf(ctx).harnessAccounts.list({}), accountList);
	},
});
const quota = defineCommand({
	meta: { name: "quota", description: "Read an account's quota and reset times" },
	args: {
		id: { type: "positional", required: true, description: "Account ID" },
		refresh: { type: "boolean", description: "Refresh the cached quota" },
	},
	async run(context) {
		const ctx = contextOf(context);
		printRecord(
			ctx.out,
			ctx.format,
			await clientOf(ctx).harnessAccounts.quota(
				compact({ id: context.args.id, refresh: context.args.refresh || undefined }),
			),
			quotaRecord,
		);
	},
});
export default defineCommand({
	meta: { name: "accounts", description: "List harness accounts and check quota" },
	subCommands: { list, quota },
});
