import type { PullRequest, PullRequestSummary, TrellisClient } from "@trellis/api";
import { reviewHref, reviewRef } from "@trellis/api/client";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { contextOf, readText, wantsJson } from "../../context.ts";
import { notFound, usageError } from "../../errors.ts";
import { json } from "../../output.ts";
import { githubBody } from "./githubBody.ts";
import { refusalText, summaryChecks, warningText } from "./refusalText.ts";

type PullRequestRef = { id: string; url: string };

const resolvePullRequest = async (client: TrellisClient, input: string, retain: boolean): Promise<PullRequestRef> => {
	const reviews = await client.reviews.prs({});
	if (/^\d+$/.test(input)) {
		const number = Number(input);
		const local = reviews.filter((row) => row.number === number);
		if (local.length > 1)
			throw usageError(`pull request ${input} matches more than one repository; use owner/repo#${input}`);
		if (local.length === 1) return { id: local[0]!.id, url: local[0]!.url };
		if (!retain) throw notFound("pull request", input);
		const remote = (await client.reviews.mine({})).filter((row) => row.number === number);
		if (remote.length === 0) throw notFound("pull request", input);
		if (remote.length > 1)
			throw usageError(`pull request ${input} matches more than one repository; use owner/repo#${input}`);
		const opened = await client.reviews.open({ pr: remote[0]!.url });
		return { id: opened.id, url: opened.url };
	}
	const url = reviewRef(input).url;
	const local = reviews.find((row) => row.url === url);
	if (local) return { id: local.id, url: local.url };
	if (!retain) throw notFound("pull request", input);
	const opened = await client.reviews.open({ pr: url });
	return { id: opened.id, url: opened.url };
};

const currentHead = async (
	client: TrellisClient,
	ref: PullRequestRef,
): Promise<{ sha: string; pullRequest: PullRequest }> => {
	const pullRequest = await client.pullRequests.refresh({ id: ref.id });
	const status = await client.reviews.status({ pr: ref.url });
	return { sha: status.headRefOid as string, pullRequest };
};

const reviewUrl = (publicUrl: string, prUrl: string): string => `${publicUrl}${reviewHref(prUrl)}`;

const labeledLine = (label: string, value: string): string => {
	const prefix = `${label.padEnd(10)}`;
	return value
		.split(/\r?\n/)
		.map((line, index) => `${index === 0 ? prefix : " ".repeat(prefix.length)}${line}`)
		.join("\n");
};

const summaryText = (summary: PullRequestSummary): string =>
	`${labeledLine("headline", summary.headline)}\n${labeledLine("why", summary.why)}\n${labeledLine("watch", summary.watch)}\n`;

const ref = { type: "positional", required: true, description: "Pull request number, URL, or owner/repo#123" } as const;

const write = defineCommand({
	meta: { name: "write", description: "Write a summary for the current pull request head" },
	args: {
		ref,
		headline: { type: "string", required: true, description: "Instruction of 12 words or less" },
		why: { type: "string", required: true, description: "Problem, approach, and limit, or - for stdin" },
		watch: { type: "string", required: true, description: "First file to read and the reason, or the word nothing" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const input = {
			headline: context.args.headline,
			why: await readText(ctx, context.args.why),
			watch: context.args.watch,
		};
		const checks = summaryChecks(input);
		if (checks.some(({ result }) => result.refusals.length > 0)) {
			ctx.err.write(refusalText(checks));
			return 4;
		}
		const client = clientOf(ctx);
		const resolved = await resolvePullRequest(client, context.args.ref, true);
		const head = await currentHead(client, resolved);
		const result = await client.pullRequests.writeSummary({ id: resolved.id, headSha: head.sha, ...input });
		if (result.warnings.length > 0) ctx.err.write(warningText(result.warnings));
		const githubText = githubBody(result.summary, head.pullRequest, reviewUrl(ctx.publicUrl, resolved.url));
		if (wantsJson(ctx)) ctx.out.write(json({ ...result, body: githubText }));
		else ctx.out.write(githubText);
		return 0;
	},
});

const show = defineCommand({
	meta: { name: "show", description: "Show the newest stored summary" },
	args: { ref },
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const resolved = await resolvePullRequest(client, context.args.ref, false);
		const summary = await client.pullRequests.readSummary({ id: resolved.id });
		if (summary === null) throw notFound("summary for pull request", context.args.ref);
		ctx.out.write(wantsJson(ctx) ? json(summary) : summaryText(summary));
	},
});

const body = defineCommand({
	meta: { name: "body", description: "Print the GitHub body for the current pull request head" },
	args: { ref },
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const resolved = await resolvePullRequest(client, context.args.ref, false);
		const head = await currentHead(client, resolved);
		const summary = await client.pullRequests.readSummaryHead({ id: resolved.id, headSha: head.sha });
		if (summary === null) throw notFound("summary for pull request head", context.args.ref);
		const text = githubBody(summary, head.pullRequest, reviewUrl(ctx.publicUrl, resolved.url));
		ctx.out.write(wantsJson(ctx) ? json({ body: text }) : text);
	},
});

export default defineCommand({
	meta: { name: "summary", description: "Write, show, or print a pull request summary" },
	subCommands: { write, show, body },
});
