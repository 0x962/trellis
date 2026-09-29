import { expect, test } from "bun:test";
import type { GhRunner } from "../../gh/run.ts";
import type { IoCtx, PrepareCtx } from "../support.ts";
import { metadata, mine } from "./remote.ts";

const runner = (responses: unknown[]) => {
	const calls: string[][] = [];
	let index = 0;
	const gh = Object.assign(
		async (_slot: string, args: string[]) => {
			calls.push(args);
			return {
				ok: true as const,
				code: 0,
				stdout: JSON.stringify(responses[index++]),
				stderr: "",
			};
		},
		{ bin: "gh", timeoutMs: 30_000 },
	) as GhRunner;
	return { gh, calls };
};

const pullRequest = (number: number) => ({
	number,
	title: `Pull request ${number}`,
	repository: { nameWithOwner: "acme/app" },
	isDraft: false,
	url: `https://github.com/acme/app/pull/${number}`,
});

const minePage = (nodes: ReturnType<typeof pullRequest>[], endCursor: string | null, totalCount: number) => ({
	data: {
		viewer: {
			pullRequests: {
				nodes,
				pageInfo: { hasNextPage: endCursor !== null, endCursor },
				totalCount,
			},
		},
	},
});

const stackEntry = (position: number) => ({
	position,
	pullRequest: {
		number: position,
		title: `Pull request ${position}`,
		state: "OPEN",
		url: `https://github.com/acme/app/pull/${position}`,
		isDraft: false,
	},
});

const metadataPage = (nodes: ReturnType<typeof stackEntry>[], endCursor: string | null, totalCount: number) => ({
	data: {
		repository: {
			pullRequest: {
				mergeQueueEntry: { position: 4, enqueuedAt: "2026-09-29T12:00:00Z" },
				stack: {
					entries: {
						nodes,
						pageInfo: { hasNextPage: endCursor !== null, endCursor },
						totalCount,
					},
				},
			},
		},
	},
});

test("lists an open pull request after the first 100 results", async () => {
	const first = Array.from({ length: 100 }, (_, index) => pullRequest(200 - index));
	const { gh, calls } = runner([minePage(first, "pull-page-2", 101), minePage([pullRequest(100)], null, 101)]);
	const ctx = {
		gh,
		core: {},
		newTx: async () => [{ owner: "acme", repo: "app" }],
	} as unknown as IoCtx & PrepareCtx;

	const result = await mine(ctx, { project: "TRL" });

	expect(result).toHaveLength(101);
	expect(result.at(-1)?.number).toBe(100);
	expect(calls).toHaveLength(2);
	expect(calls[0]?.join(" ")).toContain(
		"pullRequests(first:100,after:$cursor,states:OPEN,orderBy:{field:UPDATED_AT,direction:DESC})",
	);
	expect(calls[1]).toContain("cursor=pull-page-2");
});

test("keeps only the project repositories without changing their order", async () => {
	const other = {
		...pullRequest(3),
		repository: { nameWithOwner: "other/repo" },
		url: "https://github.com/other/repo/pull/3",
	};
	const { gh } = runner([minePage([pullRequest(4), other, pullRequest(2)], null, 3)]);
	const ctx = {
		gh,
		core: {},
		newTx: async () => [{ owner: "ACME", repo: "APP" }],
	} as unknown as IoCtx & PrepareCtx;

	const result = await mine(ctx, { project: "TRL" });

	expect(result.map((row) => row.number)).toEqual([4, 2]);
});

test("lists a stack entry after the first 50 results", async () => {
	const first = Array.from({ length: 50 }, (_, index) => stackEntry(index + 1));
	const { gh, calls } = runner([metadataPage(first, "stack-page-2", 51), metadataPage([stackEntry(51)], null, 51)]);

	const result = await metadata({ gh } as unknown as PrepareCtx, {
		pr: "https://github.com/acme/app/pull/51",
	});

	const entries = (result.stack as { entries: { nodes: ReturnType<typeof stackEntry>[] } }).entries.nodes;
	expect(entries).toHaveLength(51);
	expect(entries.at(-1)?.position).toBe(51);
	expect(calls).toHaveLength(2);
	expect(calls[1]).toContain("cursor=stack-page-2");
});

test("accepts empty final pages", async () => {
	const mineRunner = runner([minePage([pullRequest(2)], "pull-page-2", 1), minePage([], null, 1)]);
	const mineResult = await mine({ gh: mineRunner.gh } as unknown as IoCtx & PrepareCtx, {});

	const stackRunner = runner([metadataPage([stackEntry(1)], "stack-page-2", 1), metadataPage([], null, 1)]);
	const metadataResult = await metadata({ gh: stackRunner.gh } as unknown as PrepareCtx, {
		pr: "https://github.com/acme/app/pull/1",
	});

	expect(mineResult.map((row) => row.number)).toEqual([2]);
	expect(
		(metadataResult.stack as { entries: { nodes: ReturnType<typeof stackEntry>[] } }).entries.nodes.map(
			(entry) => entry.position,
		),
	).toEqual([1]);
});

test("refuses an incomplete page set", async () => {
	const { gh } = runner([minePage([pullRequest(2)], null, 2)]);

	await expect(mine({ gh } as unknown as IoCtx & PrepareCtx, {})).rejects.toThrow(
		"GitHub returned an incomplete pull request list.",
	);
});
