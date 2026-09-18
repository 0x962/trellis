import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applySuggestionEdits,
	joinFileLines,
	lineEndingOf,
	type ReviewApply,
	type ReviewApplyResult,
	type ReviewThread,
	type SuggestionEdit,
	splitFileLines,
	suggestionEditsOverlap,
} from "@trellis/api";
import type { Tx } from "../../db/tx";
import { invalidInput } from "../../errors";
import { fail, notFound, type PrepareCtx, type ServiceCtx } from "../support";
import { changed, findPr, parseRef, readThreads, writeThread } from "./queries";
import { gh, headRepositoryOf, readRepositoryFile } from "./revision";
import { firstSuggestion, sameLines } from "./suggestions";

type Prepared = { threadIds: string[]; sha: string; url: string };

type HeadMeta = {
	headRefOid: string;
	headRefName: string;
	state: string;
	headRepository?: { name?: string; nameWithOwner?: string } | null;
	headRepositoryOwner?: { login?: string } | null;
};

// A GraphQL request goes to gh as a file. The gh runner ignores stdin, and
// a file holds a whole tree of file contents where the command line does
// not.
const graphql = async (ctx: PrepareCtx, query: string, variables: Record<string, unknown>) => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-review-apply-"));
	const file = join(directory, "request.json");
	try {
		await writeFile(file, JSON.stringify({ query, variables }), { mode: 0o600 });
		return JSON.parse(await gh(ctx, ["api", "graphql", "--input", file])) as Record<string, unknown>;
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
};

const rejects = (thread: ReviewThread) => {
	if (thread.status !== "open") return `Thread ${thread.id} is resolved.`;
	if (!thread.suggestion) return `Thread ${thread.id} has no suggestion with known original lines.`;
	if (thread.suggestion.state !== "open") return `The suggestion of thread ${thread.id} is ${thread.suggestion.state}.`;
	if (thread.side !== "new") return `Thread ${thread.id} sits on deleted lines, which a suggestion cannot replace.`;
	if (firstSuggestion(thread.body) === null) return `Thread ${thread.id} has no suggestion block.`;
	return null;
};

const markOutdated = async (ctx: PrepareCtx, id: string) => {
	await ctx.newTx(async (tx) => {
		const [thread] = await readThreads(tx, [id]);
		thread!.suggestion = { ...thread!.suggestion!, state: "outdated" };
		thread!.updatedAt = ctx.now().toISOString();
		await writeThread(tx, thread!);
		await changed(ctx, tx, thread!.prId);
	});
};

// Reads every file the suggestions touch at the pull request head, checks
// that each suggestion still replaces the lines it was written for, and
// commits the new contents on the head branch in one commit.
export async function prepareApply(ctx: PrepareCtx, input: ReviewApply): Promise<Prepared> {
	const ref = parseRef(input.pr);
	const pr = await ctx.newTx((tx) => findPr(tx, input.pr));
	if (!pr) throw notFound("pullRequest", input.pr);
	const threads = await ctx.newTx((tx) => readThreads(tx, input.threadIds));
	for (const thread of threads) {
		if (thread.prId !== pr.id) throw invalidInput("threadIds", `Thread ${thread.id} belongs to another pull request.`);
		const reason = rejects(thread);
		if (reason !== null) throw invalidInput("threadIds", reason);
	}
	const meta = JSON.parse(
		await gh(ctx, ["pr", "view", ref.url, "--json", "headRefOid,headRefName,headRepository,headRepositoryOwner,state"]),
	) as HeadMeta;
	if (meta.state !== "OPEN") throw invalidInput("pr", "Suggestions apply to an open pull request only.");
	if (meta.headRefOid !== input.headSha)
		throw invalidInput("headSha", "The PR head changed. Refresh before you apply a suggestion.");
	const repository = headRepositoryOf(ref, meta);
	const byPath = new Map<string, ReviewThread[]>();
	for (const thread of threads) byPath.set(thread.path, [...(byPath.get(thread.path) ?? []), thread]);
	const additions: { path: string; contents: string }[] = [];
	for (const [path, group] of byPath) {
		const edits: (SuggestionEdit & { thread: ReviewThread })[] = group.map((thread) => ({
			startLine: thread.startLine,
			line: thread.line,
			lines: firstSuggestion(thread.body)!,
			thread,
		}));
		if (suggestionEditsOverlap(edits))
			throw invalidInput(
				"threadIds",
				`Two suggestions in ${path} touch the same lines. One commit takes one suggestion per line.`,
			);
		const content = await readRepositoryFile(ctx, repository, path, meta.headRefOid);
		const lines = splitFileLines(content);
		for (const edit of edits) {
			if (!sameLines(lines.slice(edit.startLine - 1, edit.line), edit.thread.suggestion!.original)) {
				await markOutdated(ctx, edit.thread.id);
				throw fail("REVIEW_SUGGESTION_STALE", { threadId: edit.thread.id });
			}
		}
		const next = applySuggestionEdits(lines, edits);
		additions.push({
			path,
			contents: Buffer.from(joinFileLines(next, lineEndingOf(content), content.endsWith("\n"))).toString("base64"),
		});
	}
	const authors = [...new Set(threads.map((thread) => thread.author))];
	const message =
		input.message?.trim() ||
		(threads.length === 1 ? `Apply suggestion from ${authors[0]}` : "Apply suggestions from code review");
	const [headline, ...rest] = message.split("\n");
	const body = [rest.join("\n").trim(), `Suggested in Trellis review by ${authors.join(", ")}.`]
		.filter((part) => part.length > 0)
		.join("\n\n");
	const result = await graphql(
		ctx,
		"mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid url } } }",
		{
			input: {
				branch: { repositoryNameWithOwner: repository, branchName: meta.headRefName },
				expectedHeadOid: meta.headRefOid,
				message: { headline, body },
				fileChanges: { additions },
			},
		},
	);
	const commit = (result.data as { createCommitOnBranch: { commit: { oid: string; url: string } } })
		.createCommitOnBranch.commit;
	return { threadIds: threads.map((thread) => thread.id), sha: commit.oid, url: commit.url };
}

// Records the commit on each thread and resolves the thread, the way
// GitHub resolves a thread whose suggestion was applied.
export async function applyResult(ctx: ServiceCtx, tx: Tx, input: Prepared): Promise<ReviewApplyResult> {
	const at = ctx.now().toISOString();
	const threads = await readThreads(tx, input.threadIds);
	for (const thread of threads) {
		thread.suggestion = { ...thread.suggestion!, state: "applied", appliedSha: input.sha, appliedAt: at };
		thread.status = "resolved";
		thread.resolvedAt = at;
		thread.resolvedBy = ctx.actor.name;
		thread.updatedAt = at;
		await writeThread(tx, thread);
	}
	if (threads[0] !== undefined) await changed(ctx, tx, threads[0].prId);
	return { sha: input.sha, url: input.url, threads };
}
