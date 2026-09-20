import type { PullRequest, PullRequestSummary, TrellisClient } from "@trellis/api";
import { reviewHref, reviewRef } from "@trellis/api/client";
import { defineCommand } from "citty";
import { clientOf } from "../../client.ts";
import { contextOf, readText, wantsJson } from "../../context.ts";
import { notFound, usageError } from "../../errors.ts";
import { json } from "../../output.ts";
import { githubBody } from "./githubBody.ts";
import { refusalText, summaryChecks, warningText } from "./refusalText.ts";

type ResolvedPullRequest = { id: string; url: string };

const resolvePullRequest = async (client: TrellisClient, input: string): Promise<ResolvedPullRequest> => {
	let url: string;
	if (/^\d+$/.test(input)) {
		const number = Number(input);
		const local = (await client.reviews.prs({})).filter((row) => row.number === number);
		if (local.length > 1)
			throw usageError(`pull request ${input} matches more than one repository; use owner/repo#${input}`);
		if (local.length === 1) return { id: local[0]!.id, url: local[0]!.url };
		const remote = (await client.reviews.mine({})).filter((row) => row.number === number);
		if (remote.length === 0) throw notFound("pull request", input);
		if (remote.length > 1)
			throw usageError(`pull request ${input} matches more than one repository; use owner/repo#${input}`);
		url = remote[0]!.url;
	} else {
		url = reviewRef(input).url;
	}
	const opened = await client.reviews.open({ pr: url });
	return { id: opened.id, url };
};

const currentPullRequest = async (
	client: TrellisClient,
	resolved: ResolvedPullRequest,
): Promise<{ headSha: string; pullRequest: PullRequest }> => {
	const pullRequest = await client.pullRequests.refresh({ id: resolved.id });
	const status = await client.reviews.status({ pr: resolved.url });
	return { headSha: status.headRefOid as string, pullRequest };
};

const reviewUrl = (publicUrl: string, prUrl: string): string => `${publicUrl}${reviewHref(prUrl)}`;

const row = (label: string, value: string): string => {
	const prefix = `${label.padEnd(10)}`;
	return value
		.split(/\r?\n/)
		.map((line, index) => `${index === 0 ? prefix : " ".repeat(prefix.length)}${line}`)
		.join("\n");
};

const summaryText = (summary: PullRequestSummary): string =>
	`${row("headline", summary.headline)}\n${row("why", summary.why)}\n${row("watch", summary.watch)}\n`;

const pr = { type: "positional", required: true, description: "Pull request number, URL, or owner/repo#123" } as const;

const write = defineCommand({
	meta: { name: "write", description: "Write a summary for the current pull request head" },
	args: {
		pr,
		headline: { type: "string", required: true, description: "Instruction of 12 words or less" },
		why: { type: "string", required: true, description: "Problem, approach, and limit, or - for stdin" },
		watch: { type: "string", required: true, description: "First file to read and the reason, or nothing" },
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
		const resolved = await resolvePullRequest(client, context.args.pr);
		const current = await currentPullRequest(client, resolved);
		const result = await client.pullRequests.writeSummary({ id: resolved.id, headSha: current.headSha, ...input });
		if (result.warnings.length > 0) ctx.err.write(warningText(result.warnings));
		const body = githubBody(result.summary, current.pullRequest, reviewUrl(ctx.publicUrl, resolved.url));
		if (wantsJson(ctx)) ctx.out.write(json({ ...result, body }));
		else ctx.out.write(body);
		return 0;
	},
});

const show = defineCommand({
	meta: { name: "show", description: "Show the newest stored summary" },
	args: { pr },
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const resolved = await resolvePullRequest(client, context.args.pr);
		const summary = await client.pullRequests.readSummary({ id: resolved.id });
		if (summary === null) throw notFound("summary for pull request", context.args.pr);
		ctx.out.write(wantsJson(ctx) ? json(summary) : summaryText(summary));
	},
});

const body = defineCommand({
	meta: { name: "body", description: "Print the GitHub body for the current pull request head" },
	args: { pr },
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const resolved = await resolvePullRequest(client, context.args.pr);
		const current = await currentPullRequest(client, resolved);
		const summary = await client.pullRequests.readSummaryHead({ id: resolved.id, headSha: current.headSha });
		if (summary === null) throw notFound("summary for pull request head", context.args.pr);
		const text = githubBody(summary, current.pullRequest, reviewUrl(ctx.publicUrl, resolved.url));
		ctx.out.write(wantsJson(ctx) ? json({ body: text }) : text);
	},
});

export default defineCommand({
	meta: { name: "summary", description: "Write, show, or print a pull request summary" },
	subCommands: { write, show, body },
});
