import type { ReviewSubmit } from "@trellis/api";
import { sql } from "drizzle-orm";
import {
	type PullRequestRow as LocalPullRequestRow,
	pullRequestColumns,
	toPullRequest,
} from "../../db/queries/pullRequestRows.ts";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
import { invalidInput } from "../../errors";
import { fetchPullRequests, type PullRequestRow as GithubPullRequestRow, withQueueState } from "../../gh/graphql";
import { projectRepos } from "../projectsRepos";
import { recordAction } from "../pullRequestAction";
import { fail, type IoCtx, type PrepareCtx, type ServiceCtx } from "../support";
import { parseRef, readThreads } from "./queries";
import { recordSubmission } from "./recordSubmission";
import { gh, ghJson } from "./revision";
export const actionNames = [
	"merge",
	"admin-merge",
	"automerge",
	"disable-automerge",
	"queue",
	"dequeue",
	"close",
	"ready",
	"update-branch",
] as const;
export type Action = (typeof actionNames)[number];
type PreparedAction = {
	action: Action;
	row: GithubPullRequestRow;
};

const current = async (ctx: PrepareCtx, pr: string, action: PreparedAction["action"]): Promise<PreparedAction> => {
	const ref = parseRef(pr);
	const result = await fetchPullRequests(ctx.gh, [ref], "interactive");
	if (!result.ok) {
		const error = fail("GH_UNAVAILABLE", { reason: result.reason });
		error.message = result.message;
		throw error;
	}
	const first = result.results[0]!;
	if (!("row" in first)) {
		const error = fail("GH_UNAVAILABLE", { reason: "error" });
		error.message = first.error;
		throw error;
	}
	return { action, row: first.row };
};

export async function action(ctx: PrepareCtx, input: { pr: string; action: Action; headSha: string }) {
	const ref = parseRef(input.pr);
	const meta = await ghJson<{
		id: string;
		headRefOid: string;
	}>(ctx, ["pr", "view", ref.url, "--json", "id,headRefOid"]);
	if (meta.headRefOid !== input.headSha) throw fail("PR_HEAD_MOVED", { currentHeadSha: meta.headRefOid });
	const a = input.action;
	if (a === "queue" || a === "dequeue") {
		const mutation = a === "queue" ? "enqueuePullRequest" : "dequeuePullRequest";
		await gh(ctx, [
			"api",
			"graphql",
			"-f",
			`query=mutation($id:ID!){ ${mutation}(input:{pullRequestId:$id}){ clientMutationId } }`,
			"-f",
			`id=${meta.id}`,
		]);
	} else {
		const args: Record<Exclude<Action, "queue" | "dequeue">, string[]> = {
			merge: ["merge", "--squash", "--match-head-commit", input.headSha],
			"admin-merge": ["merge", "--squash", "--admin", "--match-head-commit", input.headSha],
			automerge: ["merge", "--squash", "--auto", "--match-head-commit", input.headSha],
			"disable-automerge": ["merge", "--disable-auto"],
			close: ["close"],
			ready: ["ready"],
			"update-branch": ["update-branch"],
		};
		const [verb, ...flags] = args[a];
		await gh(ctx, ["pr", verb!, ref.url, ...flags]);
	}
	const prepared = await current(ctx, input.pr, input.action);
	if (a === "queue" || a === "dequeue") prepared.row = withQueueState(prepared.row, a === "queue");
	return prepared;
}

// A local verdict can carry a thread from an older commit because the agent
// applies the feedback to the current head. The pull request must still own
// each thread.
type SubmissionPullRequest = LocalPullRequestRow & { head_sha: string | null };

const threadsForSubmission = async (tx: Tx, input: ReviewSubmit, prId: string) => {
	if (input.threadIds.length === 0) return [];
	const threads = await readThreads(tx, input.threadIds);
	for (const thread of threads) {
		if (thread.prId !== prId) throw invalidInput("threadIds", `Thread ${thread.id} belongs to another pull request.`);
	}
	return threads;
};

export async function submit(ctx: ServiceCtx, tx: Tx, input: ReviewSubmit) {
	const ref = parseRef(input.pr);
	const [pr] = await rows<SubmissionPullRequest>(
		tx,
		sql`SELECT ${pullRequestColumns}, p.head_sha FROM pull_requests p
			WHERE p.owner = ${ref.owner} AND p.repo = ${ref.repo} AND p.number = ${ref.number}`,
	);
	if (pr === undefined) throw invalidInput("pr", "Open this pull request in Trellis before you submit a review.");
	const threads = await threadsForSubmission(tx, input, pr.id);
	const [currentRevision] = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM review_revisions
			WHERE pr_id = ${pr.id} AND head_sha = ${pr.head_sha}
			ORDER BY created_at DESC, id DESC LIMIT 1`,
	);
	const submission = await recordSubmission(ctx, tx, {
		prId: pr.id,
		verdict: input.verdict,
		url: pr.url,
		author: ctx.actor.name,
		body: input.body,
		revisionId: currentRevision?.id ?? null,
		threads,
	});
	const [fresh] = await rows<LocalPullRequestRow>(
		tx,
		sql`SELECT ${pullRequestColumns} FROM pull_requests p WHERE p.id = ${pr.id}`,
	);
	return { pullRequest: toPullRequest(fresh!), submission };
}

export const actionResult = async (ctx: IoCtx, tx: Tx, input: PreparedAction) => {
	return recordAction(ctx, tx, input);
};

type PageInfo = { hasNextPage: boolean; endCursor: string | null };

const incomplete = (subject: string): never => {
	const error = fail("GH_UNAVAILABLE", { reason: "error" });
	error.message = `GitHub returned an incomplete ${subject}.`;
	throw error;
};

const nextCursor = (page: PageInfo, cursor: string | null, subject: string) => {
	if (!page.hasNextPage) return null;
	if (page.endCursor !== null && page.endCursor !== cursor) return page.endCursor;
	return incomplete(subject);
};

type MinePullRequest = {
	number: number;
	title: string;
	repository: { nameWithOwner: string };
	isDraft: boolean;
	url: string;
};

const mineQuery = `query($cursor:String) {
	viewer { pullRequests(first:100,after:$cursor,states:OPEN,orderBy:{field:UPDATED_AT,direction:DESC}) {
		nodes { number title repository { nameWithOwner } isDraft url }
		pageInfo { hasNextPage endCursor } totalCount
	} }
}`;

export async function mine(ctx: IoCtx & PrepareCtx, input: { project?: string }) {
	const project = input.project;
	const repos = project === undefined ? [] : await ctx.newTx((tx) => projectRepos(ctx.core, tx, { project }));
	if (project !== undefined && repos.length === 0) return [];
	const projectReposByName = new Set(repos.map((repo) => `${repo.owner}/${repo.repo}`.toLowerCase()));
	const pullRequests: MinePullRequest[] = [];
	let totalCount: number | undefined;
	let cursor: string | null = null;
	do {
		const page = await ghJson<{
			data: { viewer: { pullRequests: { nodes: MinePullRequest[]; pageInfo: PageInfo; totalCount: number } } };
		}>(ctx, ["api", "graphql", "-f", `query=${mineQuery}`, ...(cursor === null ? [] : ["-f", `cursor=${cursor}`])]);
		const connection = page.data.viewer.pullRequests;
		totalCount ??= connection.totalCount;
		if (connection.totalCount !== totalCount) incomplete("pull request list");
		pullRequests.push(...connection.nodes);
		cursor = nextCursor(connection.pageInfo, cursor, "pull request list");
	} while (cursor !== null);
	if (pullRequests.length !== totalCount || new Set(pullRequests.map((row) => row.url)).size !== totalCount)
		incomplete("pull request list");
	return pullRequests.filter(
		(row) => project === undefined || projectReposByName.has(row.repository.nameWithOwner.toLowerCase()),
	);
}

type StackEntry = {
	position: number;
	pullRequest: { number: number; title: string; state: string; url: string; isDraft: boolean };
};

type MetadataPullRequest = Record<string, unknown> & {
	stack?: { entries: { nodes: StackEntry[]; pageInfo: PageInfo; totalCount: number } } | null;
};

const metadataQuery =
	"query($owner:String!,$repo:String!,$num:Int!,$cursor:String){repository(owner:$owner,name:$repo){pullRequest(number:$num){mergeQueueEntry{position enqueuedAt} stack{entries(first:50,after:$cursor){nodes{position pullRequest{number title state url isDraft}} pageInfo{hasNextPage endCursor} totalCount}}}}}";

export async function metadata(ctx: PrepareCtx, input: { pr: string }) {
	const ref = parseRef(input.pr);
	const stack: StackEntry[] = [];
	let first: MetadataPullRequest | undefined;
	let totalCount: number | undefined;
	let cursor: string | null = null;
	do {
		const graph = await ghJson<{
			data: { repository: { pullRequest: MetadataPullRequest } };
		}>(ctx, [
			"api",
			"graphql",
			"-f",
			`query=${metadataQuery}`,
			"-f",
			`owner=${ref.owner}`,
			"-f",
			`repo=${ref.repo}`,
			"-F",
			`num=${ref.number}`,
			...(cursor === null ? [] : ["-f", `cursor=${cursor}`]),
		]);
		const pullRequest = graph.data.repository.pullRequest;
		const firstPage = first === undefined;
		first ??= pullRequest;
		const entries = pullRequest.stack?.entries;
		if (entries === undefined) {
			if (firstPage) return first;
			return incomplete("pull request stack");
		}
		totalCount ??= entries.totalCount;
		if (entries.totalCount !== totalCount) incomplete("pull request stack");
		stack.push(...entries.nodes);
		cursor = nextCursor(entries.pageInfo, cursor, "pull request stack");
	} while (cursor !== null);
	if (stack.length !== totalCount || new Set(stack.map((entry) => entry.pullRequest.url)).size !== totalCount)
		incomplete("pull request stack");
	return { ...first, stack: { entries: { nodes: stack } } };
}
export const result = <T>(_ctx: ServiceCtx, _tx: Tx, input: T) => Promise.resolve(input);
