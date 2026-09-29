import { expect, test } from "bun:test";
import { fetchPullRequests, type PullRequestResponse } from "./graphql.ts";
import type { RawContext, RawFile } from "./parse.ts";
import type { GhRunner } from "./run.ts";

const ref = { owner: "octo", repo: "repo", number: 42 };

const firstPage = (files: RawFile[], changedFiles: number): PullRequestResponse => ({
	data: {
		pr0: {
			pullRequest: {
				number: 42,
				additions: changedFiles,
				deletions: 0,
				changedFiles,
				files: {
					nodes: files,
					pageInfo: { hasNextPage: changedFiles > files.length, endCursor: "file-page-2" },
					totalCount: changedFiles,
				},
				title: "Read every file and check",
				state: "OPEN",
				isDraft: false,
				mergeQueueEntry: null,
				url: "https://github.com/octo/repo/pull/42",
				headRefOid: "head-oid",
				baseRefOid: "base-oid",
				headRefName: "pagination",
				baseRefName: "main",
				mergeable: "MERGEABLE",
				mergedAt: null,
				closedAt: null,
				reviewDecision: null,
				commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
			},
		},
	},
});

const check = (index: number): RawContext => ({
	__typename: "CheckRun",
	name: `check-${String(index).padStart(3, "0")}`,
	status: "COMPLETED",
	conclusion: "SUCCESS",
	startedAt: `2026-09-29T00:${String(index % 60).padStart(2, "0")}:00Z`,
	completedAt: `2026-09-29T00:${String(index % 60).padStart(2, "0")}:30Z`,
	detailsUrl: `https://github.com/octo/repo/actions/runs/${index}`,
	checkSuite: { workflowRun: { event: "pull_request", workflow: { name: "CI" } } },
});

const runner = (responses: Array<unknown | { failure: true }>) => {
	let index = 0;
	return Object.assign(
		async () => {
			const response = responses[index++];
			if (typeof response === "object" && response !== null && "failure" in response)
				return { ok: false as const, reason: "error" as const, message: "second page failed", code: 1, stdout: "" };
			return { ok: true as const, code: 0, stdout: JSON.stringify(response), stderr: "" };
		},
		{ bin: "gh", timeoutMs: 30_000 },
	) as GhRunner;
};

test("reads more than 100 files and checks", async () => {
	const files = Array.from({ length: 101 }, (_, index) => ({
		path: `src/${String(index).padStart(3, "0")}.ts`,
		changeType: "MODIFIED" as const,
		additions: 1,
		deletions: 0,
	}));
	const checks = Array.from({ length: 101 }, (_, index) => check(index));
	const first = firstPage(files.slice(0, 100), 101);
	const pull = first.data.pr0!.pullRequest!;
	pull.commits = {
		nodes: [
			{
				commit: {
					statusCheckRollup: {
						contexts: {
							nodes: checks.slice(0, 100),
							pageInfo: { hasNextPage: true, endCursor: "check-page-2" },
							totalCount: 101,
						},
					},
				},
			},
		],
	};

	const result = await fetchPullRequests(
		runner([
			first,
			{
				data: {
					repository: {
						pullRequest: {
							headRefOid: pull.headRefOid,
							baseRefOid: pull.baseRefOid,
							changedFiles: 101,
							files: {
								nodes: files.slice(100),
								pageInfo: { hasNextPage: false, endCursor: null },
								totalCount: 101,
							},
						},
					},
				},
			},
			{
				data: {
					repository: {
						pullRequest: {
							headRefOid: pull.headRefOid,
							baseRefOid: pull.baseRefOid,
							commits: {
								nodes: [
									{
										commit: {
											statusCheckRollup: {
												contexts: {
													nodes: checks.slice(100),
													pageInfo: { hasNextPage: false, endCursor: null },
													totalCount: 101,
												},
											},
										},
									},
								],
							},
						},
					},
				},
			},
		]),
		[ref],
		"interactive",
	);

	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(result.message);
	const entry = result.results[0]!;
	if (!("row" in entry)) throw new Error(entry.error);
	expect(entry.row.files).toHaveLength(101);
	expect(entry.row.checks).toHaveLength(101);
	expect(entry.row.ciState).toBe("pass");
});

test("returns a GitHub failure after the first page", async () => {
	const first = firstPage([{ path: "src/one.ts", changeType: "MODIFIED", additions: 1, deletions: 0 }], 2);

	const result = await fetchPullRequests(runner([first, { failure: true }]), [ref], "interactive");

	expect(result).toMatchObject({ ok: false, reason: "error", message: "second page failed" });
});

test("rejects a revision change during pagination", async () => {
	const first = firstPage([{ path: "src/one.ts", changeType: "MODIFIED", additions: 1, deletions: 0 }], 2);
	const result = await fetchPullRequests(
		runner([
			first,
			{
				data: {
					repository: {
						pullRequest: {
							headRefOid: "new-head",
							baseRefOid: "base-oid",
							changedFiles: 2,
							files: {
								nodes: [],
								pageInfo: { hasNextPage: false, endCursor: null },
								totalCount: 2,
							},
						},
					},
				},
			},
		]),
		[ref],
		"interactive",
	);

	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(result.message);
	expect(result.results[0]).toMatchObject({
		error: "The pull request changed while Trellis read its files and checks.",
	});
});
