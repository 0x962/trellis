import type { PullRequestConnection, PullRequestRef, RawPullRequest } from "../graphql.ts";
import { parseGhJsonResult } from "../json.ts";
import type { GhFailure, GhRunner, GhSlot } from "../run.ts";
import { pullRequestCheckFields, pullRequestFileFields } from "./queryFields.ts";

const filePageQuery = `query($owner:String!,$repo:String!,$number:Int!,$cursor:String!) {
	repository(owner:$owner,name:$repo) { pullRequest(number:$number) {
		headRefOid baseRefOid changedFiles files(first:100,after:$cursor) { ${pullRequestFileFields} }
	} }
}`;

const checkPageQuery = `query($owner:String!,$repo:String!,$number:Int!,$cursor:String!) {
	repository(owner:$owner,name:$repo) { pullRequest(number:$number) {
		headRefOid baseRefOid commits(last:1) { nodes { commit { statusCheckRollup {
			contexts(first:100,after:$cursor) { ${pullRequestCheckFields} }
		} } } }
	} }
}`;

type FilePageResponse = {
	data: {
		repository: {
			pullRequest: Pick<RawPullRequest, "headRefOid" | "baseRefOid" | "changedFiles" | "files">;
		};
	};
};

type CheckPageResponse = {
	data: {
		repository: {
			pullRequest: Pick<RawPullRequest, "headRefOid" | "baseRefOid" | "commits">;
		};
	};
};

type CompleteResult = { ok: true } | { ok: false; error: string } | GhFailure;

const pageArgs = (query: string, ref: PullRequestRef, cursor: string) => [
	"api",
	"graphql",
	"-f",
	`query=${query}`,
	"-f",
	`owner=${ref.owner}`,
	"-f",
	`repo=${ref.repo}`,
	"-F",
	`number=${ref.number}`,
	"-f",
	`cursor=${cursor}`,
];

const nextCursor = <T>(connection: PullRequestConnection<T>, cursor: string | null): string | null | undefined => {
	if (!connection.pageInfo.hasNextPage) return null;
	const next = connection.pageInfo.endCursor;
	if (next === null || next === cursor || connection.nodes.length === 0) return undefined;
	return next;
};

const revisionMatches = (raw: RawPullRequest, page: { headRefOid: string; baseRefOid: string }) =>
	page.headRefOid === raw.headRefOid && page.baseRefOid === raw.baseRefOid;

const readPage = async <T>(
	runGh: GhRunner,
	slot: GhSlot,
	args: string[],
): Promise<{ ok: true; value: T } | GhFailure> => {
	const result = await runGh(slot, args);
	if (!result.ok) return result;
	const parsed = parseGhJsonResult<T>(args, result.stdout, result.code);
	return parsed.ok ? { ok: true, value: parsed.value } : parsed.failure;
};

const completeFiles = async (
	runGh: GhRunner,
	slot: GhSlot,
	ref: PullRequestRef,
	raw: RawPullRequest,
): Promise<CompleteResult> => {
	if (raw.files.totalCount !== raw.changedFiles)
		return { ok: false, error: "GitHub returned an incomplete changed file list." };
	let cursor: string | null | undefined = nextCursor(raw.files, null);
	if (cursor === undefined) return { ok: false, error: "GitHub returned an incomplete changed file list." };
	while (typeof cursor === "string") {
		const args = pageArgs(filePageQuery, ref, cursor);
		const result = await readPage<FilePageResponse>(runGh, slot, args);
		if (!result.ok) return result;
		const page = result.value.data.repository.pullRequest;
		if (!revisionMatches(raw, page))
			return { ok: false, error: "The pull request changed while Trellis read its files and checks." };
		if (page.changedFiles !== raw.changedFiles || page.files.totalCount !== raw.files.totalCount)
			return { ok: false, error: "The pull request changed while Trellis read its files and checks." };
		raw.files.nodes.push(...page.files.nodes);
		const next: string | null | undefined = nextCursor(page.files, cursor);
		if (next === undefined) return { ok: false, error: "GitHub returned an incomplete changed file list." };
		cursor = next;
	}
	if (
		raw.files.nodes.length !== raw.changedFiles ||
		new Set(raw.files.nodes.map((file) => file.path)).size !== raw.changedFiles
	)
		return { ok: false, error: "GitHub returned an incomplete changed file list." };
	return { ok: true };
};

const completeChecks = async (
	runGh: GhRunner,
	slot: GhSlot,
	ref: PullRequestRef,
	raw: RawPullRequest,
): Promise<CompleteResult> => {
	const rollup = raw.commits.nodes[0]?.commit.statusCheckRollup ?? null;
	if (rollup === null) return { ok: true };
	let cursor: string | null | undefined = nextCursor(rollup.contexts, null);
	if (cursor === undefined) return { ok: false, error: "GitHub returned an incomplete check list." };
	while (typeof cursor === "string") {
		const args = pageArgs(checkPageQuery, ref, cursor);
		const result = await readPage<CheckPageResponse>(runGh, slot, args);
		if (!result.ok) return result;
		const page = result.value.data.repository.pullRequest;
		if (!revisionMatches(raw, page))
			return { ok: false, error: "The pull request changed while Trellis read its files and checks." };
		const pageRollup = page.commits.nodes[0]?.commit.statusCheckRollup ?? null;
		if (pageRollup === null || pageRollup.contexts.totalCount !== rollup.contexts.totalCount)
			return { ok: false, error: "The pull request changed while Trellis read its files and checks." };
		rollup.contexts.nodes.push(...pageRollup.contexts.nodes);
		const next: string | null | undefined = nextCursor(pageRollup.contexts, cursor);
		if (next === undefined) return { ok: false, error: "GitHub returned an incomplete check list." };
		cursor = next;
	}
	if (rollup.contexts.nodes.length !== rollup.contexts.totalCount)
		return { ok: false, error: "GitHub returned an incomplete check list." };
	return { ok: true };
};

export const completePullRequestPages = async (
	runGh: GhRunner,
	slot: GhSlot,
	ref: PullRequestRef,
	raw: RawPullRequest,
): Promise<CompleteResult> => {
	const files = await completeFiles(runGh, slot, ref, raw);
	if (!files.ok) return files;
	return completeChecks(runGh, slot, ref, raw);
};
