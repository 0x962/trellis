import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { contextOf, wantsJson } from "../../context.ts";
import { notFound } from "../../errors.ts";
import { fileAt } from "../../file.ts";
import { json } from "../../output.ts";
import { uploadImages } from "../markdownImages.ts";
import { currentHead, resolvePullRequest } from "../pullRequestRef.ts";

const ref = { type: "positional", required: true, description: "Pull request number, URL, or owner/repo#123" } as const;

const write = defineCommand({
	meta: { name: "write", description: "Write the evidence document of a pull request; a new write replaces it" },
	args: {
		ref,
		body: {
			type: "string",
			required: true,
			description: "Markdown file path, or - for stdin; local images upload",
		},
	},
	async run(context) {
		const ctx = contextOf(context);
		const markdown = context.args.body === "-" ? await ctx.deps.stdin() : await fileAt(context.args.body).text();
		const client = clientOf(ctx);
		const resolved = await resolvePullRequest(client, context.args.ref, true);
		const head = await currentHead(client, resolved);
		const body = await uploadImages(client, resolved.id, markdown);
		const evidence = await client.pullRequests.writeEvidence({ id: resolved.id, headSha: head.sha, body });
		ctx.out.write(wantsJson(ctx) ? json(evidence) : `${evidence.body}\n`);
	},
});

const show = defineCommand({
	meta: { name: "show", description: "Show the evidence document of a pull request" },
	args: { ref },
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const resolved = await resolvePullRequest(client, context.args.ref, false);
		const evidence = await client.pullRequests.readEvidence({ id: resolved.id });
		if (evidence === null) throw notFound("evidence document for pull request", context.args.ref);
		ctx.out.write(wantsJson(ctx) ? json(evidence) : `${evidence.body}\n`);
	},
});

export default defineCommand({
	meta: { name: "evidence", description: "Write or show the evidence document of a pull request" },
	subCommands: { write, show },
});
