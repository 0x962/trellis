import type { Evidence } from "@trellis/api";
import { defineCommand } from "citty";
import { ulid } from "ulid";
import { clientOf } from "../../client.ts";
import { contextOf } from "../../context.ts";
import { printRecord, type RecordSpec } from "../../output.ts";
import { currentHead, resolvePullRequest } from "../pullRequestRef.ts";
import { captureInput } from "./kinds.ts";

const evidenceRecord: RecordSpec<Evidence> = {
	fields: [
		{ name: "id", value: (row) => row.id },
		{ name: "kind", value: (row) => row.kind },
		{ name: "headSha", value: (row) => row.headSha },
		{ name: "createdAt", value: (row) => row.createdAt },
	],
	identifier: (row) => row.id,
};

const add = defineCommand({
	meta: { name: "add", description: "Add evidence to the current pull request head" },
	args: {
		ref: { type: "positional", required: true, description: "Pull request number, URL, or owner/repo#123" },
		kind: { type: "enum", options: ["capture"], required: true, description: "Evidence kind" },
		base: { type: "string", required: true, description: "Merge base SHA" },
		route: { type: "string", required: true, description: "Captured route" },
		viewport: { type: "string", required: true, description: "Captured viewport" },
		theme: { type: "string", required: true, description: "Captured theme" },
		seed: { type: "string", required: true, description: "Seed command" },
		browser: { type: "string", required: true, description: "Capture browser" },
		time: { type: "string", required: true, description: "ISO 8601 capture time" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const resolved = await resolvePullRequest(client, context.args.ref, true);
		const head = await currentHead(client, resolved);
		const row = await client.pullRequests.writeEvidence(
			captureInput({
				id: resolved.id,
				evidenceId: ulid(),
				headSha: head.sha,
				baseSha: context.args.base,
				route: context.args.route,
				viewport: context.args.viewport,
				theme: context.args.theme,
				seed: context.args.seed,
				browser: context.args.browser,
				capturedAt: context.args.time,
			}),
		);
		printRecord(ctx.out, ctx.format, row, evidenceRecord);
	},
});

export default defineCommand({
	meta: { name: "evidence", description: "Add evidence to a pull request" },
	subCommands: { add },
});
