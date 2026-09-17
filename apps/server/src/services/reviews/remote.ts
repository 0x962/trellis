import type { ReviewSubmit } from "@trellis/api";
import type { Tx } from "../../db/tx";
import { invalidInput } from "../../errors";
import { fetchPullRequests, type PullRequestRow } from "../../gh/graphql";
import { recordAction } from "../pullRequestAction";
import { fail, type PrepareCtx, type ServiceCtx } from "../support";
import { parseRef } from "./queries";
import { gh } from "./revision";
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
	"deploy-on",
	"deploy-off",
	"live-create",
	"live-deploy",
	"live-delete",
	"live-enable",
	"live-disable",
	"live-persist",
	"live-unpersist",
] as const;
export type Action = (typeof actionNames)[number];
type PreparedAction = { action: Action | ReviewSubmit["verdict"]; row: PullRequestRow };

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
	const meta = JSON.parse(await gh(ctx, ["pr", "view", ref.url, "--json", "id,headRefOid,state,headRefName"])) as {
		id: string;
		headRefOid: string;
		state: string;
		headRefName: string;
	};
	if (meta.headRefOid !== input.headSha)
		throw invalidInput("headSha", "The PR head changed. Refresh before this action.");
	const a = input.action;
	if (a.startsWith("live-")) {
		if (`${ref.owner}/${ref.repo}` !== "canary-technologies-corp/canary")
			throw invalidInput("pr", "This repository has no Live Branch workflow.");
		if (meta.state !== "OPEN" || meta.headRefName.startsWith("golem/"))
			throw invalidInput("pr", "Live Branch requires an open PR outside a golem branch.");
	}
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
			"deploy-on": ["edit", "--add-label", "00_AUTO_DEPLOY"],
			"deploy-off": ["edit", "--remove-label", "00_AUTO_DEPLOY"],
			"live-create": ["comment", "--body", "/create-live-branch"],
			"live-deploy": ["comment", "--body", "/deploy-live-branch"],
			"live-delete": ["comment", "--body", "/delete-live-branch"],
			"live-enable": ["edit", "--add-label", "Live Branch: Enabled"],
			"live-disable": ["edit", "--remove-label", "Live Branch: Enabled,Lite Env: Enabled"],
			"live-persist": ["edit", "--add-label", "Live Branch: Persist"],
			"live-unpersist": ["edit", "--remove-label", "Live Branch: Persist,Lite Env: Persist"],
		};
		const [verb, ...flags] = args[a];
		await gh(ctx, ["pr", verb!, ref.url, ...flags]);
	}
	return current(ctx, input.pr, input.action);
}

export async function submit(ctx: PrepareCtx, input: ReviewSubmit) {
	const ref = parseRef(input.pr);
	const meta = JSON.parse(await gh(ctx, ["pr", "view", ref.url, "--json", "headRefOid"])) as {
		headRefOid: string;
	};
	if (meta.headRefOid !== input.headSha)
		throw invalidInput("headSha", "The PR head changed. Refresh before this review.");
	const flag = {
		comment: "--comment",
		approve: "--approve",
		request_changes: "--request-changes",
	}[input.verdict];
	await gh(ctx, ["pr", "review", ref.url, flag, "--body", input.body]);
	return current(ctx, input.pr, input.verdict);
}

export const actionResult = (ctx: ServiceCtx, tx: Tx, input: PreparedAction) => recordAction(ctx, tx, input);
export async function mine(ctx: PrepareCtx) {
	const raw = await gh(ctx, [
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
		"--json",
		"number,title,repository,isDraft,url",
	]);
	return JSON.parse(raw) as {
		number: number;
		title: string;
		repository: { nameWithOwner: string };
		isDraft: boolean;
		url: string;
	}[];
}
export async function metadata(ctx: PrepareCtx, input: { pr: string }) {
	const ref = parseRef(input.pr);
	const query =
		"query($owner:String!,$repo:String!,$num:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$num){mergeQueueEntry{position enqueuedAt} stack{entries(first:50){nodes{position pullRequest{number title state url isDraft}}}}}}}";
	const [graphRaw, rawLabels] = await Promise.all([
		gh(ctx, [
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
		]),
		gh(ctx, [
			"label",
			"list",
			"-R",
			`${ref.owner}/${ref.repo}`,
			"--search",
			"00_AUTO_DEPLOY",
			"--limit",
			"20",
			"--json",
			"name",
		]),
	]);
	const graph = JSON.parse(graphRaw);
	const labels = (rawLabels.trim() === "" ? [] : JSON.parse(rawLabels)) as { name: string }[];
	return {
		...graph.data.repository.pullRequest,
		autoDeployAvailable: labels.some((l) => l.name === "00_AUTO_DEPLOY"),
	} as Record<string, unknown>;
}
export const result = <T>(_ctx: ServiceCtx, _tx: Tx, input: T) => Promise.resolve(input);
