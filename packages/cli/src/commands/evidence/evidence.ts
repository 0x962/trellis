import type { Evidence } from "@trellis/api";
import { defineCommand } from "citty";
import { ulid } from "ulid";
import { clientOf } from "../../client.ts";
import { contextOf, readText } from "../../context.ts";
import { fileAt } from "../../file.ts";
import { printRecord, type RecordSpec } from "../../output.ts";
import { currentHead, resolvePullRequest } from "../pullRequestRef.ts";
import { type EvidenceArgs, evidenceInput, evidenceKinds, validateKindFlags } from "./kinds.ts";

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
	meta: { name: "add", description: "Add evidence to a pull request head" },
	args: {
		ref: { type: "positional", required: true, description: "Pull request number, URL, or owner/repo#123" },
		kind: { type: "enum", options: [...evidenceKinds], required: true, description: "Evidence kind" },
		file: { type: "string", description: "File path" },
		route: { type: "string", description: "Captured route" },
		viewport: { type: "string", description: "Captured viewport" },
		theme: { type: "string", description: "Captured theme" },
		seed: { type: "string", description: "Seed command" },
		browser: { type: "string", description: "Capture browser" },
		base: { type: "string", description: "Merge base SHA" },
		sha: { type: "string", description: "Head SHA" },
		caption: { type: "string", description: "Clip caption" },
		cmd: { type: "string", description: "Command" },
		exit: { type: "string", description: "Exit code" },
		tail: { type: "string", description: "Output tail, or - for stdin" },
		name: { type: "string", description: "Test name" },
		"fails-on": { type: "string", description: "SHA where the test fails" },
		"passes-on": { type: "string", description: "SHA where the test passes" },
		none: { type: "boolean", description: "Record that no item applies" },
		reason: { type: "string", description: "Reason no test applies" },
		before: { type: "string", description: "Contract before text, or - for stdin" },
		after: { type: "string", description: "Contract after text, or - for stdin" },
		table: { type: "string", description: "Migration table, or - for stdin" },
		why: { type: "string", description: "Reason for the picture" },
		time: { type: "string", description: "ISO 8601 capture time" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const args = context.args as unknown as EvidenceArgs & { ref: string };
		validateKindFlags(args);
		const file = args.file === undefined ? undefined : fileAt(args.file as string);
		const [tail, before, after, table] = await Promise.all(
			[args.tail, args.before, args.after, args.table].map((value) =>
				value === undefined ? undefined : readText(ctx, value as string),
			),
		);
		const argsWithStdin = {
			...args,
			tail,
			before,
			after,
			table,
		} as EvidenceArgs;
		const client = clientOf(ctx);
		const resolved = await resolvePullRequest(client, args.ref, true);
		const headSha = args.sha === undefined ? (await currentHead(client, resolved)).sha : (args.sha as string);
		const row = await client.pullRequests.writeEvidence(
			evidenceInput({ id: resolved.id, evidenceId: ulid(), headSha }, argsWithStdin, file),
		);
		printRecord(ctx.out, ctx.format, row, evidenceRecord);
	},
});

export default defineCommand({
	meta: { name: "evidence", description: "Add evidence to a pull request" },
	subCommands: { add },
});
