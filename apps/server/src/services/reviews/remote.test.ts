import { afterAll, beforeAll, expect, test } from "bun:test";
import type { GhRunner } from "../../gh/run.ts";
import { setRepos } from "../projectsRepos.ts";
import type { IoCtx, PrepareCtx } from "../support.ts";
import { localReviewFixture } from "./localReviewState/fixture.ts";
import { metadata, mine } from "./remote.ts";

let h: Awaited<ReturnType<typeof localReviewFixture>>;
beforeAll(async () => {
	h = await localReviewFixture();
	await h.run((tx) => setRepos(h.ctx(h.human).core, tx, { project: "GLY", repos: [{ owner: "ACME", repo: "APP" }] }));
});
afterAll(async () => h.close());

const runner = (responses: unknown[], beforeCall = () => {}) => {
	const calls: string[][] = [];
	let index = 0;
	const gh = Object.assign(
		async (_slot: string, args: string[]) => {
			beforeCall();
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
	const ctx = { ...h.ctx(h.human), gh };

	const result = await mine(ctx, { project: "GLY" });

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
	const ctx = { ...h.ctx(h.human), gh };

	const result = await mine(ctx, { project: "GLY" });

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
	const mineResult = await mine({ ...h.ctx(h.human), gh: mineRunner.gh }, {});

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

test("returns saved local intent and approval, with null only for a missing record", async () => {
	await h.mark("ready");
	await h.submit(h.human, "approve");
	const saved = { ...pullRequest(1), url: h.url, repository: { nameWithOwner: "fixture/review" }, isDraft: true };
	let transactionOpen = false;
	const { gh } = runner([minePage([saved, pullRequest(999)], null, 2)], () => expect(transactionOpen).toBe(false));
	const ctx = h.ctx(h.human);
	const newTx: IoCtx["newTx"] = (work) =>
		ctx.newTx(async (tx) => {
			transactionOpen = true;
			const result = await work(tx);
			transactionOpen = false;
			return result;
		});
	const result = await mine({ ...ctx, newTx, gh }, {});
	expect(result[0]?.local).toEqual({ localState: "ready", localVerdict: "approved" });
	expect(result[1]?.local).toBeNull();
});

test("propagates a failed local read instead of reporting missing intent", async () => {
	const { gh } = runner([minePage([pullRequest(1)], null, 1)]);
	const failure = new Error("Local read failed");
	const newTx: IoCtx["newTx"] = async () => {
		throw failure;
	};
	await expect(mine({ ...h.ctx(h.human), newTx, gh }, {})).rejects.toBe(failure);
});
