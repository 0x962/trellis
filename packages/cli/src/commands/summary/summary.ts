import { EvidenceWriteInputSchema, type PullRequestSummary, type TrellisClient } from "@trellis/api";
import { reviewHref } from "@trellis/api/client";
import { defineCommand } from "citty";
import { ulid } from "ulid";
import { clientOf } from "../../client.ts";
import { contextOf, readText, wantsJson } from "../../context.ts";
import { notFound } from "../../errors.ts";
import { fileAt } from "../../file.ts";
import { json } from "../../output.ts";
import { refusalText, steReport, warningText } from "../../steReport.ts";
import { currentHead, type PullRequestRef, resolvePullRequest } from "../pullRequestRef.ts";
import { githubBody } from "./githubBody.ts";
import { localImages, withImageUrls } from "./summaryImages.ts";

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

// Each local image goes up as a picture record of the head, the way
// `trellis evidence add --kind picture` sends one. The summary then points at
// the stored file, which the Overview tab shows.
const uploadImages = async (
	client: TrellisClient,
	pullRequest: PullRequestRef,
	headSha: string,
	images: { alt: string; path: string; file: File }[],
): Promise<Map<string, string>> => {
	const urls = new Map<string, string>();
	for (const image of images) {
		const row = await client.pullRequests.writeEvidence(
			EvidenceWriteInputSchema.parse({
				id: pullRequest.id,
				evidenceId: ulid(),
				headSha,
				kind: "picture",
				record: { why: image.alt },
				file: image.file,
			}),
		);
		urls.set(image.path, row.blob!.url);
	}
	return urls;
};

const ref = { type: "positional", required: true, description: "Pull request number, URL, or owner/repo#123" } as const;

const write = defineCommand({
	meta: { name: "write", description: "Write a plain explanation for the current pull request head" },
	args: {
		ref,
		headline: { type: "string", required: true, description: "One spoken sentence about the change" },
		why: {
			type: "string",
			required: true,
			description: "Markdown explanation with images and mermaid blocks, or - for stdin; local images upload",
		},
		watch: { type: "string", required: true, description: "First file to read and the reason, or the word nothing" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const input = {
			headline: context.args.headline,
			why: await readText(ctx, context.args.why),
			watch: context.args.watch,
		};
		const checks = [
			steReport(input.headline, { headline: true }, "headline"),
			steReport(input.why, { headline: false }, "why"),
			steReport(input.watch, { headline: false }, "watch"),
		];
		if (checks.some(({ result }) => result.refusals.length > 0)) {
			ctx.err.write(`${refusalText(checks)}${warningText(checks)}`);
			return 4;
		}
		const images = localImages(input.why).map((image) => ({ ...image, file: fileAt(image.path) }));
		const client = clientOf(ctx);
		const resolved = await resolvePullRequest(client, context.args.ref, true);
		const head = await currentHead(client, resolved);
		const urls = await uploadImages(client, resolved, head.sha, images);
		const result = await client.pullRequests.writeSummary({
			id: resolved.id,
			headSha: head.sha,
			...input,
			why: withImageUrls(input.why, urls),
		});
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
