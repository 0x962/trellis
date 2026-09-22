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
import { effectiveRepos } from "../projectsRepos";
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
// With a project, the search covers the repositories of that project and
// its ancestors. A project with no repository has no pull request of its
// own, so the search does not run.
export async function mine(ctx: IoCtx & PrepareCtx, input: { project?: string }) {
	const project = input.project;
	const repos = project === undefined ? [] : await ctx.newTx((tx) => effectiveRepos(ctx.core, tx, { project }));
	if (project !== undefined && repos.length === 0) return [];
	return ghJson<
		{
			number: number;
			title: string;
			repository: { nameWithOwner: string };
			isDraft: boolean;
			url: string;
		}[]
	>(ctx, [
		"search",
		"prs",
		"--author",
		"@me",
		"--state",
		"open",
		"--limit",
		"100",
		"--sort",
		"updated",
		...repos.flatMap((repo) => ["--repo", `${repo.owner}/${repo.repo}`]),
		"--json",
		"number,title,repository,isDraft,url",
	]);
}
export async function metadata(ctx: PrepareCtx, input: { pr: string }) {
	const ref = parseRef(input.pr);
	const query =
		"query($owner:String!,$repo:String!,$num:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$num){mergeQueueEntry{position enqueuedAt} stack{entries(first:50){nodes{position pullRequest{number title state url isDraft}}}}}}}";
	const graph = await ghJson<{
		data: { repository: { pullRequest: Record<string, unknown> } };
	}>(ctx, [
		"api",
		"graphql",
		"-f",
		`query=${query}`,
		"-f",
		`owner=${ref.owner}`,
		"-f",
		`repo=${ref.repo}`,
		"-F",
		`num=${ref.number}`,
	]);
	return graph.data.repository.pullRequest as Record<string, unknown>;
}
export const result = <T>(_ctx: ServiceCtx, _tx: Tx, input: T) => Promise.resolve(input);
