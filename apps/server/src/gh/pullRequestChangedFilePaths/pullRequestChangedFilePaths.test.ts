import { expect, test } from "bun:test";
import type { GhRunner } from "../run.ts";
import { pullRequestChangedFilePaths } from "./pullRequestChangedFilePaths.ts";

const pull = { owner: "example", repo: "app", number: 12, headSha: "reviewed" };
const page = (paths: string[], total: number, next: string | null, head = "reviewed", base = "base") => ({
	data: {
		repository: {
			pullRequest: {
				headRefOid: head,
				baseRefOid: base,
				changedFiles: total,
				files: { nodes: paths.map((path) => ({ path })), pageInfo: { hasNextPage: next !== null, endCursor: next } },
			},
		},
	},
});
const runner = (read: (args: string[]) => unknown) =>
	Object.assign(
		async (_slot: string, args: string[]) => ({
			ok: true as const,
			code: 0,
			stderr: "",
			stdout: JSON.stringify(read(args)),
		}),
		{ bin: "gh", timeoutMs: 30000 },
	) as GhRunner;

test("reads all pages and retains names and extensions", async () => {
	const paths = Array.from({ length: 251 }, (_, i) => `src/a ${i}.tsx`);
	let calls = 0;
	const result = await pullRequestChangedFilePaths(
		pull,
		runner((args) => {
			const index = calls++;
			if (index > 0) expect(args).toContain(`cursor=page-${index}`);
			return page(paths.slice(index * 100, (index + 1) * 100), 251, index === 2 ? null : `page-${index + 1}`);
		}),
	);
	expect(calls).toBe(3);
	expect(result).toEqual(paths);
});

test("refuses truncated or duplicate paths instead of classifying a partial diff", async () => {
	await expect(
		pullRequestChangedFilePaths(
			pull,
			runner(() => page(["a.ts"], 2, null)),
		),
	).rejects.toThrow("incomplete");
	await expect(
		pullRequestChangedFilePaths(
			pull,
			runner(() => page(["a.ts", "a.ts"], 2, null)),
		),
	).rejects.toThrow("incomplete");
});

test("refuses a changed head or base during pagination", async () => {
	await expect(
		pullRequestChangedFilePaths(
			pull,
			runner(() => page([], 0, null, "new-head")),
		),
	).rejects.toThrow("pull request changed");
	let calls = 0;
	await expect(
		pullRequestChangedFilePaths(
			pull,
			runner(() => (calls++ === 0 ? page(["a.ts"], 2, "next") : page(["b.ts"], 2, null, "reviewed", "new-base"))),
		),
	).rejects.toThrow("pull request changed");
});
