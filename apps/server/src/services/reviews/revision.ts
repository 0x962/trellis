import { type ReviewRevision, type ReviewThread, splitFileLines } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
import { invalidInput } from "../../errors";
import { fail, notFound, type PrepareCtx, type ServiceCtx } from "../support";
import { ghUnavailableText } from "./ghUnavailableText/ghUnavailableText.ts";
import { changed, ensurePr, parseRef, readThread, writeThread } from "./queries";
import { sameLines } from "./suggestions";

export async function gh(ctx: PrepareCtx, args: string[]) {
	const result = await ctx.gh("interactive", args);
	if (!result.ok) {
		const error = fail("GH_UNAVAILABLE", { reason: result.reason });
		error.message = ghUnavailableText(result.message);
		throw error;
	}
	return result.stdout;
}
const fields =
	"title,state,isDraft,author,headRepository,headRepositoryOwner,headRefName,baseRefName,headRefOid,baseRefOid,additions,deletions,changedFiles,mergeable,mergeStateStatus,reviewDecision,reviewRequests,autoMergeRequest,body,comments,reviews,statusCheckRollup,labels,commits";

// The text of one file at one commit, from the repository that holds the
// commit. The head of a fork pull request lives in the fork.
export const readRepositoryFile = (ctx: PrepareCtx, repository: string, path: string, sha: string) =>
	gh(ctx, [
		"api",
		`repos/${repository}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${sha}`,
		"-H",
		"Accept: application/vnd.github.raw+json",
	]);

type HeadRepositoryMeta = {
	headRepository?: { name?: string; nameWithOwner?: string } | null;
	headRepositoryOwner?: { login?: string } | null;
};

// `owner/name` of the repository that holds the head branch. gh names it
// in full on the head repository, or in two parts, or not at all when the
// fork is gone.
export const headRepositoryOf = (ref: { owner: string; repo: string }, meta: HeadRepositoryMeta) =>
	meta.headRepository?.nameWithOwner ??
	(meta.headRepositoryOwner?.login && meta.headRepository?.name
		? `${meta.headRepositoryOwner.login}/${meta.headRepository.name}`
		: `${ref.owner}/${ref.repo}`);

// The open suggestions of a pull request that sit on an older revision. A
// suggestion whose lines still stand at the new head moves to the new
// revision, so it stays in view and applies. One whose lines changed is
// outdated.
const suggestionMoves = async (
	ctx: PrepareCtx,
	ref: ReturnType<typeof parseRef>,
	headSha: string,
	repository: string,
) => {
	const candidates = await ctx.newTx((tx) =>
		rows<{ document: ReviewThread }>(
			tx,
			sql`SELECT t.document FROM review_threads t
			JOIN review_revisions r ON r.id = t.revision_id
			JOIN pull_requests p ON p.id = t.pr_id
			WHERE p.owner = ${ref.owner} AND p.repo = ${ref.repo} AND p.number = ${ref.number}
			AND t.document->>'status' = 'open' AND t.document->'suggestion'->>'state' = 'open'
			AND t.document->>'side' = 'new' AND r.head_sha <> ${headSha}`,
		),
	);
	const files = new Map<string, string[]>();
	const reanchor: string[] = [];
	const outdated: string[] = [];
	for (const { document: thread } of candidates) {
		if (!files.has(thread.path))
			files.set(thread.path, splitFileLines(await readRepositoryFile(ctx, repository, thread.path, headSha)));
		const current = files.get(thread.path)!.slice(thread.startLine - 1, thread.line);
		(sameLines(current, thread.suggestion!.original) ? reanchor : outdated).push(thread.id);
	}
	return { reanchor, outdated };
};
export async function status(ctx: PrepareCtx, input: { pr: string }) {
	const ref = parseRef(input.pr);
	return JSON.parse(await gh(ctx, ["pr", "view", ref.url, "--json", fields])) as Record<string, unknown>;
}
export async function prepare(ctx: PrepareCtx, input: { pr: string }) {
	const ref = parseRef(input.pr);
	const meta = JSON.parse(await gh(ctx, ["pr", "view", ref.url, "--json", fields])) as Record<string, unknown> &
		HeadRepositoryMeta & {
			headRefOid: string;
			baseRefOid: string;
			title: string;
			state: string;
		};
	const [comparisonRaw, patch] = await Promise.all([
		gh(ctx, ["api", `repos/${ref.owner}/${ref.repo}/compare/${meta.baseRefOid}...${meta.headRefOid}`]),
		gh(ctx, ["pr", "diff", ref.url]),
	]);
	const comparison = JSON.parse(comparisonRaw) as { merge_base_commit: { sha: string } };
	meta.comparisonBaseSha = comparison.merge_base_commit.sha;
	const current = JSON.parse(await gh(ctx, ["pr", "view", ref.url, "--json", "headRefOid,baseRefOid"])) as {
		headRefOid: string;
		baseRefOid: string;
	};
	if (current.headRefOid !== meta.headRefOid || current.baseRefOid !== meta.baseRefOid)
		throw invalidInput("pr", "The PR changed while its diff loaded. Refresh to read the new revision.");
	const moves = await suggestionMoves(ctx, ref, meta.headRefOid, headRepositoryOf(ref, meta));
	return { ref, meta, patch, ...moves };
}
export async function refresh(
	ctx: ServiceCtx,
	tx: Tx,
	input: Awaited<ReturnType<typeof prepare>>,
): Promise<ReviewRevision> {
	const pr = await ensurePr(tx, input.ref.url);
	const [existing] = await rows<{ document: ReviewRevision }>(
		tx,
		sql`SELECT document FROM review_revisions WHERE pr_id = ${pr.id} AND head_sha = ${input.meta.headRefOid} AND base_sha = ${input.meta.baseRefOid}`,
	);
	const revision: ReviewRevision = {
		id: existing?.document.id ?? ulid(),
		prId: pr.id,
		baseSha: input.meta.baseRefOid,
		headSha: input.meta.headRefOid,
		patch: input.patch,
		meta: input.meta,
		fetchedAt: ctx.now().toISOString(),
	};
	await tx.execute(
		sql`INSERT INTO review_revisions (id, pr_id, base_sha, head_sha, document, created_at) VALUES (${revision.id}, ${pr.id}, ${revision.baseSha}, ${revision.headSha}, ${JSON.stringify(revision)}::jsonb, ${revision.fetchedAt}) ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document`,
	);
	await tx.execute(
		sql`UPDATE pull_requests SET title = ${input.meta.title}, state = ${input.meta.state.toLowerCase()}, updated_at = ${ctx.now()} WHERE id = ${pr.id}`,
	);
	for (const id of input.reanchor) {
		const thread = await readThread(tx, id);
		thread.revisionId = revision.id;
		thread.updatedAt = revision.fetchedAt;
		await writeThread(tx, thread);
	}
	for (const id of input.outdated) {
		const thread = await readThread(tx, id);
		thread.suggestion = { ...thread.suggestion!, state: "outdated" };
		thread.updatedAt = revision.fetchedAt;
		await writeThread(tx, thread);
	}
	await changed(ctx, tx, pr.id);
	return revision;
}
export async function revision(_ctx: ServiceCtx, tx: Tx, input: { pr: string; id?: string }) {
	const ref = parseRef(input.pr);
	const [row] = await rows<{ document: ReviewRevision }>(
		tx,
		sql`SELECT r.document FROM review_revisions r JOIN pull_requests p ON p.id = r.pr_id WHERE p.owner = ${ref.owner} AND p.repo = ${ref.repo} AND p.number = ${ref.number} AND (${input.id ?? null}::text IS NULL OR r.id = ${input.id ?? null}) ORDER BY r.document->>'fetchedAt' DESC LIMIT 1`,
	);
	return row?.document ?? null;
}
export async function prepareFile(
	ctx: PrepareCtx,
	input: { pr: string; revisionId: string; path: string; side: "old" | "new" },
) {
	const doc = await ctx.newTx((tx) => revision(ctx, tx, { pr: input.pr, id: input.revisionId }));
	if (!doc) throw notFound("reviewRevision", input.revisionId);
	const ref = parseRef(input.pr);
	const meta = doc.meta as { comparisonBaseSha: string } & HeadRepositoryMeta;
	const repo = input.side === "new" ? headRepositoryOf(ref, meta) : `${ref.owner}/${ref.repo}`;
	const sha = input.side === "old" ? meta.comparisonBaseSha : doc.headSha;
	return { content: await readRepositoryFile(ctx, repo, input.path, sha) };
}
export const file = (_ctx: ServiceCtx, _tx: Tx, input: { content: string }) => Promise.resolve(input);
