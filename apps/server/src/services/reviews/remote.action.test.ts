import { expect, test } from "bun:test";
import type { RawPullRequest } from "../../gh/graphql";
import type { GhFailure, GhResult, GhRunner, GhSlot, GhSuccess } from "../../gh/run";
import type { PrepareCtx } from "../support";
import { type Action, action } from "./remote";

const pr = "https://github.com/acme/app/pull/42";
const headSha = "0123456789abcdef0123456789abcdef01234567";
const viewCommand = ["pr", "view", pr, "--json", "id,headRefOid,isDraft"];
const readyCommand = ["pr", "ready", pr];
const success = (value: unknown): GhSuccess => ({
	ok: true,
	code: 0,
	stdout: JSON.stringify(value),
	stderr: "",
});
const failure: GhFailure = {
	ok: false,
	reason: "error",
	code: 1,
	message: "GitHub refuses this action.",
	stdout: "",
};
const meta = (isDraft: boolean, currentHead = headSha) => success({ id: "PR_42", headRefOid: currentHead, isDraft });
const refreshed = (state: RawPullRequest["state"], isDraft = false) => {
	const pullRequest: RawPullRequest = {
		number: 42,
		additions: 1,
		deletions: 0,
		changedFiles: 0,
		files: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: 0 },
		title: "Merge a draft pull request",
		state,
		isDraft,
		mergeQueueEntry: null,
		url: pr,
		headRefOid: headSha,
		baseRefOid: "base-oid",
		headRefName: "feature",
		baseRefName: "main",
		mergeable: "MERGEABLE",
		mergedAt: state === "MERGED" ? "2026-09-30T05:00:00Z" : null,
		closedAt: null,
		reviewDecision: null,
		commits: { nodes: [] },
	};
	return success({ data: { pr0: { pullRequest } } });
};
const runner = (responses: Array<GhResult | Promise<GhResult>>) => {
	const calls: string[][] = [];
	const gh: GhRunner = Object.assign(
		async (_slot: GhSlot, args: string[]) => {
			calls.push(args);
			return responses.shift()!;
		},
		{ bin: "gh", timeoutMs: undefined },
	);
	return { ctx: { gh } as PrepareCtx, calls };
};

const mergeCases: Array<{ name: Action; flags: string[]; state: RawPullRequest["state"] }> = [
	{ name: "merge", flags: ["--squash"], state: "MERGED" },
	{ name: "admin-merge", flags: ["--squash", "--admin"], state: "MERGED" },
	{ name: "automerge", flags: ["--squash", "--auto"], state: "OPEN" },
];

test.each(mergeCases)("marks a draft ready before $name with the reviewed commit", async ({ name, flags, state }) => {
	const { ctx, calls } = runner([meta(true), success(null), success(null), refreshed(state)]);

	const result = await action(ctx, { pr, action: name, headSha });

	expect(calls.slice(0, 3)).toEqual([
		viewCommand,
		readyCommand,
		["pr", "merge", pr, ...flags, "--match-head-commit", headSha],
	]);
	expect(calls).toHaveLength(4);
	expect(result).toMatchObject({ action: name, row: { state: state.toLowerCase(), isDraft: false } });
});

test.each(mergeCases)(
	"skips readiness before $name for a pull request that is ready",
	async ({ name, flags, state }) => {
		const { ctx, calls } = runner([meta(false), success(null), refreshed(state)]);

		await action(ctx, { pr, action: name, headSha });

		expect(calls.slice(0, 2)).toEqual([viewCommand, ["pr", "merge", pr, ...flags, "--match-head-commit", headSha]]);
		expect(calls).toHaveLength(3);
	},
);

test("marks a draft ready before it enters the merge queue", async () => {
	const { ctx, calls } = runner([meta(true), success(null), success(null), refreshed("OPEN")]);

	const result = await action(ctx, { pr, action: "queue", headSha });

	expect(calls.slice(0, 2)).toEqual([viewCommand, readyCommand]);
	expect(calls[2]?.join(" ")).toContain("enqueuePullRequest(input:{pullRequestId:$id})");
	expect(calls[2]).toContain("id=PR_42");
	expect(calls).toHaveLength(4);
	expect(result).toMatchObject({ action: "queue", row: { isDraft: false, isQueued: true } });
});

test.each(["merge", "admin-merge", "automerge", "queue"] as const)(
	"refuses a changed head before readiness or %s",
	async (name) => {
		const { ctx, calls } = runner([meta(true, "another-head")]);

		await expect(action(ctx, { pr, action: name, headSha })).rejects.toMatchObject({
			code: "PR_HEAD_MOVED",
			data: { currentHeadSha: "another-head" },
		});
		expect(calls).toEqual([viewCommand]);
	},
);

test.each(["merge", "admin-merge", "automerge", "queue"] as const)(
	"stops before %s when readiness fails",
	async (name) => {
		const { ctx, calls } = runner([meta(true), failure]);

		await expect(action(ctx, { pr, action: name, headSha })).rejects.toMatchObject({
			code: "GH_UNAVAILABLE",
			message: failure.message,
		});
		expect(calls).toEqual([viewCommand, readyCommand]);
	},
);

test("awaits readiness before merge", async () => {
	const ready = Promise.withResolvers<GhResult>();
	const { ctx, calls } = runner([meta(true), ready.promise, success(null), refreshed("MERGED")]);
	const pending = action(ctx, { pr, action: "merge", headSha });

	try {
		await Bun.sleep(0);
		expect(calls).toEqual([viewCommand, readyCommand]);
	} finally {
		ready.resolve(success(null));
		await pending;
	}
	expect(calls[2]?.slice(0, 2)).toEqual(["pr", "merge"]);
});

test("returns the merge failure after readiness succeeds", async () => {
	const { ctx, calls } = runner([meta(true), success(null), failure]);

	await expect(action(ctx, { pr, action: "merge", headSha })).rejects.toMatchObject({
		code: "GH_UNAVAILABLE",
		message: failure.message,
	});
	expect(calls).toEqual([viewCommand, readyCommand, ["pr", "merge", pr, "--squash", "--match-head-commit", headSha]]);
});

test.each(["disable-automerge", "dequeue", "close", "update-branch"] as const)(
	"keeps the draft flag for %s",
	async (name) => {
		const { ctx, calls } = runner([meta(true), success(null), refreshed("OPEN", true)]);

		const result = await action(ctx, { pr, action: name, headSha });

		expect(calls).toHaveLength(3);
		expect(calls.some((args) => args[0] === "pr" && args[1] === "ready")).toBe(false);
		expect(result.row.isDraft).toBe(true);
	},
);

test("sends one readiness command for the explicit ready action", async () => {
	const { ctx, calls } = runner([meta(true), success(null), refreshed("OPEN")]);

	await action(ctx, { pr, action: "ready", headSha });

	expect(calls.slice(0, 2)).toEqual([viewCommand, readyCommand]);
	expect(calls).toHaveLength(3);
});
