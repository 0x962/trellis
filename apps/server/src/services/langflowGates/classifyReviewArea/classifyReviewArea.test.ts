import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { openTestDb } from "../../../db/testDb.ts";
import { pullRequestChangedFilePaths } from "../../../gh/pullRequestChangedFilePaths";
import type { GhRunner } from "../../../gh/run.ts";
import { evaluate } from "../../providers/evaluate";
import { remoteHarness } from "../../providers/testSupport/testSupport.ts";
import { classifyReviewArea } from "./classifyReviewArea.ts";
import { reviewFilePaths } from "./reviewFilePaths.ts";

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
					const request = JSON.parse(init.body as string);
					expect(request.state.changedFilePaths).toEqual(paths);
					expect(request.questions.area.instructions).toContain("filtered production file list");
					expect(request.questions.area.instructions).not.toContain("Include tests");
					return Response.json({ answers: { area: { type: "choice", choice } } });
				}),
		});
		expect(result).toEqual({ frontend, backend });
		expect(pages).toBe(3);
		expect(requests).toBe(1);
		expect(JSON.stringify(h.logs)).toContain('"inputPathCount":251');
		expect(JSON.stringify(h.logs)).toContain('"retainedPathCount":251');
		expect(JSON.stringify(h.logs)).not.toContain(paths[0]!);
	});

test("keeps production files and removes unrelated review files", async () => {
	const h = remoteHarness(db);
	const paths = [
		"apps/web/src/AccountPage.tsx",
		"apps/server/src/account.ts",
		"apps/server/drizzle/0151_account.sql",
		"vite.config.ts",
		"apps/web/src/AccountPage.test.tsx",
		"apps/server/src/fixtures/account.fixture.ts",
		"apps/web/src/__snapshots__/AccountPage.snap",
		"apps/web/src/AccountPage.stories.tsx",
		"docs/account.md",
		"docs/account-flow.svg",
		"docs/account-guide.mdx",
		"bun.lock",
		"apps/web/dist/assets/account.js",
		"apps/web/src/AccountPage.tsx",
		"tests/migrations/fixture.sql",
	];
	let evaluatedPaths: unknown;
	const result = await classifyReviewArea(h.ctx, input, {
		pullRequestChangedFilePaths: async () => paths,
		evaluate: async (_ctx, body) => {
			evaluatedPaths = body.state;
			return { answers: { area: { type: "choice", choice: "both" } } };
		},
	});
	expect(result).toEqual({ frontend: true, backend: true });
	expect(evaluatedPaths).toEqual({
		changedFilePaths: [
			"apps/web/src/AccountPage.tsx",
			"apps/server/src/account.ts",
			"apps/server/drizzle/0151_account.sql",
			"vite.config.ts",
		],
	});
	expect(JSON.stringify(h.logs)).toContain('"inputPathCount":15');
	expect(JSON.stringify(h.logs)).toContain('"retainedPathCount":4');
	for (const path of paths) expect(JSON.stringify(h.logs)).not.toContain(path);
});

test("returns neither without a provider request for an unrelated file list", async () => {
	const h = remoteHarness(db);
	let evaluations = 0;
	const result = await classifyReviewArea(h.ctx, input, {
		pullRequestChangedFilePaths: async () => ["src/account.test.ts", "docs/account.md", "bun.lock"],
		evaluate: async () => {
			evaluations++;
			throw new Error("must not evaluate");
		},
	});
	expect(result).toEqual({ frontend: false, backend: false });
	expect(evaluations).toBe(0);
	expect(JSON.stringify(h.logs)).toContain('"inputPathCount":3');
	expect(JSON.stringify(h.logs)).toContain('"retainedPathCount":0');
});

test("keeps production paths with words that resemble exclusion names", () => {
	expect(
		reviewFilePaths([
			"src/testing/service.ts",
			"src/contest/entry.ts",
			"src/fixtureFactory.ts",
			"src/snapshotService.ts",
			"src/storybookConfig.ts",
			"src/docsGenerator.ts",
			"src/buildPipeline.ts",
			"apps/web/src/pages/pricing.mdx",
			"prompts/review.md",
			"content/legal.rst",
			"content/help.adoc",
		]),
	).toEqual([
		"src/testing/service.ts",
		"src/contest/entry.ts",
		"src/fixtureFactory.ts",
		"src/snapshotService.ts",
		"src/storybookConfig.ts",
		"src/docsGenerator.ts",
		"src/buildPipeline.ts",
		"apps/web/src/pages/pricing.mdx",
		"prompts/review.md",
		"content/legal.rst",
		"content/help.adoc",
	]);
});

test("removes unrelated files before it keeps real migrations", () => {
	expect(
		reviewFilePaths([
			"apps/server/migrations/0151_account.sql",
			"apps/server/migrations/account.test.sql",
			"apps/server/migrations/fixtures/account.sql",
			"apps/server/migrations/__snapshots__/account.snap",
			"apps/server/migrations/account.stories.sql",
			"apps/server/migrations/docs/account.md",
		]),
	).toEqual(["apps/server/migrations/0151_account.sql"]);
});

test("removes exact build output directories at any path depth", () => {
	expect(
		reviewFilePaths([
			"tools/site/dist/app.js",
			"tools/site/coverage/report.json",
			"tools/site/out/app.js",
			"tools/site/.next/app.js",
			"tools/site/src/buildPipeline.ts",
			"apps/desktop/build/icon.icns",
		]),
	).toEqual(["tools/site/src/buildPipeline.ts", "apps/desktop/build/icon.icns"]);
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
