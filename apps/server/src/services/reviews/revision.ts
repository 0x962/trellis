import { type GitHubConversationItem, type ReviewRevision, type ReviewThread, splitFileLines } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
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

type GitHubUser = { login?: string; avatar_url?: string | null; type?: string | null } | null;
type GitHubIssueComment = {
	id: number;
	body?: string | null;
	html_url?: string | null;
	created_at: string;
	updated_at?: string | null;
	user?: GitHubUser;
};
type GitHubReview = {
	id: number;
	body?: string | null;
	state?: string | null;
	html_url?: string | null;
	submitted_at?: string | null;
	user?: GitHubUser;
};
type GitHubLineComment = {
	id: number;
	body?: string | null;
	path?: string | null;
	line?: number | null;
	original_line?: number | null;
	side?: string | null;
	html_url?: string | null;
	created_at: string;
	updated_at?: string | null;
	user?: GitHubUser;
};

const authorOf = (user: GitHubUser) => (user?.login ? { login: user.login, avatarUrl: user.avatar_url ?? null } : null);

const botOf = (user: GitHubUser) => user?.type === "Bot" || user?.login?.endsWith("[bot]") === true;

const sideOf = (side: string | null | undefined): "old" | "new" | null =>
	side === "LEFT" ? "old" : side === "RIGHT" ? "new" : null;

const paged = <T>(text: string): T[] => {
	const value = JSON.parse(text) as T[] | T[][];
	return Array.isArray(value[0]) ? (value as T[][]).flat() : (value as T[]);
};

const issueCommentsOf = (comments: GitHubIssueComment[]): GitHubConversationItem[] =>
	comments.map((comment) => ({
		id: `issue-comment:${comment.id}`,
		kind: "comment",
		author: authorOf(comment.user ?? null),
		body: comment.body ?? "",
		state: null,
		path: null,
		line: null,
		side: null,
		url: comment.html_url ?? null,
		isBot: botOf(comment.user ?? null),
		createdAt: comment.created_at,
		updatedAt: comment.updated_at ?? null,
	}));

const reviewsOf = (reviews: GitHubReview[]): GitHubConversationItem[] =>
	reviews
		.filter((review) => review.submitted_at)
		.map((review) => ({
			id: `review:${review.id}`,
			kind: "review",
			author: authorOf(review.user ?? null),
			body: review.body ?? "",
			state: review.state ?? null,
			path: null,
			line: null,
			side: null,
			url: review.html_url ?? null,
			isBot: botOf(review.user ?? null),
			createdAt: review.submitted_at!,
			updatedAt: null,
		}));

const lineCommentsOf = (comments: GitHubLineComment[]): GitHubConversationItem[] =>
	comments
		.filter((comment) => comment.path && (comment.line ?? comment.original_line))
		.map((comment) => ({
			id: `line-comment:${comment.id}`,
			kind: "line",
			author: authorOf(comment.user ?? null),
			body: comment.body ?? "",
			state: null,
			path: comment.path!,
			line: comment.line ?? comment.original_line ?? null,
			side: sideOf(comment.side),
			url: comment.html_url ?? null,
			isBot: botOf(comment.user ?? null),
			createdAt: comment.created_at,
			updatedAt: comment.updated_at ?? null,
		}));

const endpoint = (ref: ReturnType<typeof parseRef>, path: "comments" | "reviews" | "line-comments") =>
	path === "comments"
		? `repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments?per_page=100`
		: path === "reviews"
			? `repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews?per_page=100`
			: `repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/comments?per_page=100`;

export async function loadGitHubConversation(ctx: PrepareCtx, ref: ReturnType<typeof parseRef>) {
	const [comments, reviews, lineComments] = await Promise.all([
		gh(ctx, ["api", "--paginate", "--slurp", endpoint(ref, "comments")]),
		gh(ctx, ["api", "--paginate", "--slurp", endpoint(ref, "reviews")]),
		gh(ctx, ["api", "--paginate", "--slurp", endpoint(ref, "line-comments")]),
	]);
	return [
		...issueCommentsOf(paged<GitHubIssueComment>(comments)),
		...reviewsOf(paged<GitHubReview>(reviews)),
		...lineCommentsOf(paged<GitHubLineComment>(lineComments)),
	].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// `owner/name` of the repository that holds the head branch. gh names it
// in full on the head repository, or in two parts, or not at all when the
// fork is gone. `gh pr view --json headRepository` answers an empty
// `nameWithOwner` and puts the owner in `headRepositoryOwner`, so an empty
// name reads as no name.
export const headRepositoryOf = (ref: { owner: string; repo: string }, meta: HeadRepositoryMeta) =>
	meta.headRepository?.nameWithOwner ||
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
// GitHub answers `compare/<base head>...<pull request head>` with the commit
// that both branches share and with `behind_by`: how many commits the base
// branch holds that the pull request head does not. The review page prints
// that count as "N commits behind <base branch>".
export const comparisonFacts = (raw: string) => {
	const comparison = JSON.parse(raw) as { merge_base_commit: { sha: string }; behind_by: number };
	return { comparisonBaseSha: comparison.merge_base_commit.sha, behindBy: comparison.behind_by };
};
export async function loadCurrentRevision(ctx: PrepareCtx, ref: ReturnType<typeof parseRef>) {
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
	Object.assign(meta, comparisonFacts(comparisonRaw));
	const current = JSON.parse(await gh(ctx, ["pr", "view", ref.url, "--json", "headRefOid,baseRefOid"])) as {
		headRefOid: string;
		baseRefOid: string;
	};
	if (current.headRefOid !== meta.headRefOid || current.baseRefOid !== meta.baseRefOid)
		return loadCurrentRevision(ctx, ref);
	return { meta, patch };
}
export async function prepare(ctx: PrepareCtx, input: { pr: string }) {
	const ref = parseRef(input.pr);
	const [{ meta, patch }, githubConversation] = await Promise.all([
		loadCurrentRevision(ctx, ref),
		loadGitHubConversation(ctx, ref),
	]);
	const moves = await suggestionMoves(ctx, ref, meta.headRefOid, headRepositoryOf(ref, meta));
	return { ref, meta, patch, githubConversation, ...moves };
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
		githubConversation: input.githubConversation,
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
