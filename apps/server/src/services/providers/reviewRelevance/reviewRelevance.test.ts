import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { openTestDb } from "../../../db/testDb.ts";
import { remoteHarness } from "../testSupport/testSupport.ts";
import { reviewRelevance } from "./reviewRelevance.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
beforeAll(async () => {
	db = await openTestDb();
}, 30_000);
afterAll(async () => {
	await db.$client.close();
});

for (const [choice, frontend, backend] of [
	["frontend", true, false],
	["backend", false, true],
	["both", true, true],
	["neither", false, false],
] as const)
	test(`classifies ${choice} and sends every full path outside the transaction`, async () => {
		await db.execute(sql`DELETE FROM providers`);
		const h = remoteHarness(db);
		await h.create({ models: ["typesafe-ai/jev"] });
		let inside = false;
		const ctx = {
			newTx: async <T>(fn: Parameters<typeof h.ctx.newTx<T>>[0]) => {
				inside = true;
				const result = await h.ctx.newTx(fn);
				inside = false;
				return result;
			},
		};
		const paths = [
			...Array.from({ length: 251 }, (_, i) => `src/screens/Page ${i}.tsx`),
			"server/orders.py",
			"docs/你好.md",
		];
		const result = await reviewRelevance(ctx, paths, async (url, init) => {
			expect(inside).toBe(false);
			expect(url).toBe("https://ai-gateway.vercel.sh/v1/evaluate");
			expect(init.method).toBe("POST");
			expect(init.redirect).toBe("manual");
			expect(init.signal).toBeInstanceOf(AbortSignal);
			const body = JSON.parse(init.body as string);
			expect(body.state.changedFilePaths).toEqual(paths);
			expect(body.model).toBe("typesafe-ai/jev");
			expect(Object.keys(body.questions.area.criteria)).toEqual(["frontend", "backend", "both", "neither"]);
			return Response.json({ answers: { area: { type: "choice", choice } } });
		});
		expect(result).toEqual({ frontend, backend });
	});

test("missing or disabled Jev provider refuses the request", async () => {
	await db.execute(sql`DELETE FROM providers`);
	const h = remoteHarness(db);
	await h.create({ enabled: false, models: ["typesafe-ai/jev"] });
	await expect(
		reviewRelevance(h.ctx, [], async () => {
			throw new Error("must not fetch");
		}),
	).rejects.toThrow("enabled Vercel provider");
});

test("HTTP, malformed response and network failures expose no provider secret", async () => {
	await db.execute(sql`DELETE FROM providers`);
	const h = remoteHarness(db);
	await h.create({ models: ["typesafe-ai/jev"] });
	await expect(
		reviewRelevance(h.ctx, [], async () => new Response("secret-provider-1234", { status: 401 })),
	).rejects.toThrow("HTTP 401");
	await expect(
		reviewRelevance(h.ctx, [], async () => Response.json({ answers: { area: { choice: "secret-provider-1234" } } })),
	).rejects.toThrow("invalid review classification");
	await expect(
		reviewRelevance(h.ctx, [], async () => {
			throw new Error("secret-provider-1234");
		}),
	).rejects.toThrow("failed or timed out");
	expect(h.logs).toEqual([]);
});
