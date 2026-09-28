import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { openTestDb } from "../../../db/testDb.ts";
import { remoteHarness } from "../testSupport/testSupport.ts";
import { evaluate } from "./evaluate.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
beforeAll(async () => {
	db = await openTestDb();
}, 30_000);
afterAll(async () => {
	await db.$client.close();
});

test("sends arbitrary choice questions outside the transaction and logs only request metadata", async () => {
	await db.execute(sql`DELETE FROM providers`);
	const h = remoteHarness(db);
	const provider = await h.create({ models: ["typesafe-ai/jev"] });
	const input = {
		state: { private: "private-path.ts" },
		questions: {
			route: {
				type: "choice" as const,
				instructions: "Select a route",
				criteria: { first: "First route", second: "Second route" },
			},
		},
	};
	let inside = false;
	const ctx = {
		log: h.ctx.log,
		newTx: async <T>(fn: Parameters<typeof h.ctx.newTx<T>>[0]) => {
			inside = true;
			const result = await h.ctx.newTx(fn);
			inside = false;
			return result;
		},
	};
	const result = await evaluate(ctx, input, async (url, init) => {
		expect(inside).toBe(false);
		expect(url).toBe("https://ai-gateway.vercel.sh/v1/evaluate");
		expect(init.method).toBe("POST");
		expect(init.redirect).toBe("manual");
		expect(init.signal).toBeInstanceOf(AbortSignal);
		expect(JSON.parse(init.body as string)).toEqual({ model: "typesafe-ai/jev", ...input });
		return Response.json({ answers: { route: { type: "choice", choice: "second" } } });
	});
	expect(result.answers.route!.choice).toBe("second");
	expect(h.logs).toEqual([
		["provider.evaluate.request", { providerId: provider.id, host: "ai-gateway.vercel.sh", model: "typesafe-ai/jev" }],
		[
			"provider.evaluate.result",
			{
				providerId: provider.id,
				host: "ai-gateway.vercel.sh",
				model: "typesafe-ai/jev",
				status: 200,
				choices: { route: "second" },
			},
		],
	]);
	expect(JSON.stringify(h.logs)).not.toContain("private-path.ts");
	expect(JSON.stringify(h.logs)).not.toContain("secret-provider-1234");
});
const input = {
	state: "private-path.ts",
	questions: { route: { type: "choice" as const, instructions: "Pick one", criteria: { yes: "Yes", no: "No" } } },
};

test("missing or disabled Jev provider refuses the request", async () => {
	await db.execute(sql`DELETE FROM providers`);
	const h = remoteHarness(db);
	await h.create({ enabled: false, models: ["typesafe-ai/jev"] });
	await expect(
		evaluate(h.ctx, input, async () => {
			throw new Error("must not fetch");
		}),
	).rejects.toThrow("enabled Vercel provider");
});

test("HTTP, malformed response and network failures expose no provider secret", async () => {
	await db.execute(sql`DELETE FROM providers`);
	const h = remoteHarness(db);
	await h.create({ models: ["typesafe-ai/jev"] });
	await expect(
		evaluate(h.ctx, input, async () => new Response("secret-provider-1234", { status: 401 })),
	).rejects.toThrow("HTTP 401");
	await expect(
		evaluate(h.ctx, input, async () => Response.json({ answers: { area: { choice: "secret-provider-1234" } } })),
	).rejects.toThrow("invalid evaluation response");
	await expect(
		evaluate(h.ctx, input, async () =>
			Response.json({ answers: { route: { type: "choice", choice: "private-path.ts" } } }),
		),
	).rejects.toThrow("invalid evaluation response");
	await expect(
		evaluate(h.ctx, input, async () => {
			throw new Error("secret-provider-1234");
		}),
	).rejects.toThrow("failed or timed out");
	expect(JSON.stringify(h.logs)).not.toContain("secret-provider-1234");
	expect(JSON.stringify(h.logs)).not.toContain("private-path.ts");
	expect(h.logs.filter((entry) => (entry as unknown[])[0] === "provider.evaluate.failure")).toHaveLength(4);
});
