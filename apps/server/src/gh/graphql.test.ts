import { describe, expect, test } from "bun:test";
import { buildPullRequestQuery, mapPullRequestResponse, type PullRequestResponse, withQueueState } from "./graphql.ts";
import type { RawFile } from "./parse.ts";

const ref = { owner: "octo", repo: "repo", number: 42 };

type Size = { additions: number; deletions: number; changedFiles: number };

const defaultFiles = [
	{ path: "apps/server/src/gh/graphql.ts", changeType: "MODIFIED" as const, additions: 12, deletions: 3 },
];

const responseWithSize = (
	size: Size,
	files: RawFile[] = defaultFiles,
	headSha = "0123456789abcdef",
): PullRequestResponse => ({
	data: {
		pr0: {
			pullRequest: {
				number: 42,
				...size,
				files: { nodes: files },
				title: "Store pull request size",
				state: "OPEN",
				isDraft: false,
				mergeQueueEntry: null,
				url: "https://github.com/octo/repo/pull/42",
				headRefOid: headSha,
				headRefName: "size",
				baseRefName: "main",
				mergedAt: null,
				closedAt: null,
				reviewDecision: null,
				commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
			},
		},
	},
});

const rowOf = (size: Size, files?: RawFile[], headSha?: string) => {
	const result = mapPullRequestResponse([ref], responseWithSize(size, files, headSha))[0]!;
	if (!("row" in result)) throw new Error(result.error);
	return result.row;
};

describe("pull request GraphQL size", () => {
	test("requests all size fields", () => {
		expect(buildPullRequestQuery([ref])).toContain("number additions deletions changedFiles");
	});

	test("stores the head SHA", () => {
		expect(rowOf({ additions: 120, deletions: 30, changedFiles: 9 }).headSha).toBe("0123456789abcdef");
	});

	test("stores whether the pull request is in the merge queue", () => {
		const response = responseWithSize({ additions: 120, deletions: 30, changedFiles: 9 });
		response.data.pr0!.pullRequest!.mergeQueueEntry = { position: 1 };

		const result = mapPullRequestResponse([ref], response)[0]!;
		if (!("row" in result)) throw new Error(result.error);

		expect(result.row.isQueued).toBe(true);
	});

	test("requests at most 100 changed files", () => {
		expect(buildPullRequestQuery([ref])).toContain(
			"files(first: 100) { nodes { path changeType additions deletions } }",
		);
	});

	test("maps all size fields into the stored content", () => {
		const row = rowOf({ additions: 120, deletions: 30, changedFiles: 9 });
		expect({ additions: row.additions, deletions: row.deletions, changedFiles: row.changedFiles }).toEqual({
			additions: 120,
			deletions: 30,
			changedFiles: 9,
		});
	});

	test("includes each size field in the content hash", () => {
		const base = rowOf({ additions: 120, deletions: 30, changedFiles: 9 }).contentHash;
		expect(rowOf({ additions: 121, deletions: 30, changedFiles: 9 }).contentHash).not.toBe(base);
		expect(rowOf({ additions: 120, deletions: 31, changedFiles: 9 }).contentHash).not.toBe(base);
		expect(rowOf({ additions: 120, deletions: 30, changedFiles: 10 }).contentHash).not.toBe(base);
	});

	test("includes changed file rows in the content hash", () => {
		const size = { additions: 120, deletions: 30, changedFiles: 9 };
		const base = rowOf(size).contentHash;
		expect(
			rowOf(size, [{ path: "apps/server/src/gh/parse.ts", changeType: "MODIFIED", additions: 12, deletions: 3 }])
				.contentHash,
		).not.toBe(base);
	});

	test("includes the head SHA in the content hash", () => {
		const size = { additions: 120, deletions: 30, changedFiles: 9 };
		expect(rowOf(size, undefined, "head-two").contentHash).not.toBe(rowOf(size, undefined, "head-one").contentHash);
	});

	test("includes the merge queue state in the content hash", () => {
		const size = { additions: 120, deletions: 30, changedFiles: 9 };
		const open = responseWithSize(size);
		const queued = responseWithSize(size);
		queued.data.pr0!.pullRequest!.mergeQueueEntry = { position: 1 };
		const rows = [open, queued].map((response) => {
			const result = mapPullRequestResponse([ref], response)[0]!;
			if (!("row" in result)) throw new Error(result.error);
			return result.row;
		});

		expect(rows[0]!.contentHash).not.toBe(rows[1]!.contentHash);
	});

	test("recomputes the content hash for an immediate queue action", () => {
		const row = rowOf({ additions: 120, deletions: 30, changedFiles: 9 });
		const queued = withQueueState(row, true);

		expect(queued.isQueued).toBe(true);
		expect(queued.contentHash).not.toBe(row.contentHash);
	});
});
