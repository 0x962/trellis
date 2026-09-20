import { describe, expect, test } from "bun:test";
import { buildPullRequestQuery, mapPullRequestResponse, type PullRequestResponse } from "./graphql.ts";

const ref = { owner: "octo", repo: "repo", number: 42 };

type Size = { additions: number; deletions: number; changedFiles: number };

const responseWithSize = (size: Size): PullRequestResponse => ({
	data: {
		pr0: {
			pullRequest: {
				number: 42,
				...size,
				title: "Store pull request size",
				state: "OPEN",
				isDraft: false,
				url: "https://github.com/octo/repo/pull/42",
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

const rowOf = (size: Size) => {
	const result = mapPullRequestResponse([ref], responseWithSize(size))[0]!;
	if (!("row" in result)) throw new Error(result.error);
	return result.row;
};

describe("pull request GraphQL size", () => {
	test("requests all size fields", () => {
		expect(buildPullRequestQuery([ref])).toContain("number additions deletions changedFiles");
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
});
