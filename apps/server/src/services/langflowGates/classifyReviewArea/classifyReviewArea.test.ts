import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { openTestDb } from "../../../db/testDb.ts";
import { pullRequestChangedFilePaths } from "../../../gh/pullRequestChangedFilePaths";
import type { GhRunner } from "../../../gh/run.ts";
import { evaluate } from "../../providers/evaluate";
import { remoteHarness } from "../../providers/testSupport/testSupport.ts";
import { classifyReviewArea } from "./classifyReviewArea.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
beforeAll(async () => {
	db = await openTestDb();
}, 30_000);
afterAll(async () => {
	await db.$client.close();
});
const input = {
	executionId: "execution",
	gateKey: "frontend-gate",
	pull: { owner: "example", repo: "app", number: 12, headSha: "reviewed" },
};
const runner = (read: () => unknown) =>
	Object.assign(async () => ({ ok: true as const, code: 0, stderr: "", stdout: JSON.stringify(read()) }), {
		bin: "gh",
		timeoutMs: 30_000,
	}) as GhRunner;
const page = (paths: string[], total: number, cursor: string | null, head = "reviewed", base = "base") => ({
	data: {
		repository: {
			pullRequest: {
				headRefOid: head,
				baseRefOid: base,
				changedFiles: total,
				files: {
					nodes: paths.map((path) => ({ path })),
					pageInfo: { hasNextPage: cursor !== null, endCursor: cursor },
				},
			},
		},
	},
});

for (const [choice, frontend, backend] of [
	["frontend", true, false],
	["backend", false, true],
	["both", true, true],
	["neither", false, false],
] as const)
	test(`classifies ${choice} through the existing provider and all GitHub pages`, async () => {
		await db.execute(sql`DELETE FROM providers`);
		const h = remoteHarness(db);
		await h.create({ models: ["typesafe-ai/jev"] });
		const paths = Array.from({ length: 251 }, (_, i) => `src/Private file ${i}.tsx`);
		let pages = 0;
		let requests = 0;
		const result = await classifyReviewArea(h.ctx, input, {
			pullRequestChangedFilePaths: (pull) =>
				pullRequestChangedFilePaths(
					pull,
					runner(() => {
						const index = pages++;
						return page(
							paths.slice(index * 100, (index + 1) * 100),
							paths.length,
							index === 2 ? null : `page-${index}`,
						);
					}),
				),
			evaluate: (ctx, body) =>
				evaluate(ctx, body, async (_url, init) => {
					requests++;
					expect(JSON.parse(init.body as string).state.changedFilePaths).toEqual(paths);
					return Response.json({ answers: { area: { type: "choice", choice } } });
				}),
		});
		expect(result).toEqual({ frontend, backend });
		expect(pages).toBe(3);
		expect(requests).toBe(1);
		expect(JSON.stringify(h.logs)).toContain('"pathCount":251');
		expect(JSON.stringify(h.logs)).not.toContain(paths[0]!);
	});

for (const [name, first, second] of [
	["truncated", page(["a.ts"], 2, null), null],
	["duplicate", page(["a.ts", "a.ts"], 2, null), null],
	["changed head", page(["a.ts"], 1, null, "other-head"), null],
	["changed base", page(["a.ts"], 2, "next"), page(["b.ts"], 2, null, "reviewed", "other-base")],
	["changed count", page(["a.ts"], 2, "next"), page(["b.ts"], 3, null)],
] as const)
	test(`refuses ${name} before the provider call`, async () => {
		const h = remoteHarness(db);
		let calls = 0;
		let evaluations = 0;
		await expect(
			classifyReviewArea(h.ctx, input, {
				pullRequestChangedFilePaths: (pull) =>
					pullRequestChangedFilePaths(
						pull,
						runner(() => (calls++ === 0 ? first : second)),
					),
				evaluate: async () => {
					evaluations++;
					throw new Error("must not evaluate");
				},
			}),
		).rejects.toThrow();
		expect(evaluations).toBe(0);
	});
