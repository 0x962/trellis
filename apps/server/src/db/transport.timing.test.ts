import { afterAll, afterEach, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import { systemContext } from "../context.ts";
import { createBus } from "../events/bus.ts";
import { createLogger, type LogRecord } from "../log.ts";
import { createDbTiming } from "../serverTiming.ts";
import { services } from "../services/registry.ts";
import { prepared } from "../services/registryEntry";
import type { Db } from "./client.ts";
import { openTestDb } from "./testDb.ts";
import { createInlineTransport, type Runtime } from "./transport.ts";
import type { Tx } from "./tx.ts";

const original = services["agentRuns.list"];
let db: Db;
let now = 0;
let clock: ReturnType<typeof spyOn>;
let transaction: ReturnType<typeof spyOn>;
const lines: LogRecord[] = [];
const config = loadConfig({ TRELLIS_PORT: "0" });
const log = createLogger({
	level: "debug",
	env: {},
	sink: { isTTY: false, write: (line) => lines.push(JSON.parse(line)) },
});
const runtime: Runtime = {
	version: "test",
	bootId: "test",
	gh: Object.assign(
		async () => {
			now += 1000;
			return { ok: true as const, code: 0, stdout: "", stderr: "" };
		},
		{ bin: "unused", timeoutMs: 1000 },
	),
	ghStatus: () => ({ ok: true, user: null, reason: null, message: null, checkedAt: new Date().toISOString() }),
	addresses: async () => [],
};
const bus = createBus({ bootId: "test" });
const transport = () => createInlineTransport({ db, config, bus, runtime, log: log.info });
const query = async (tx: Tx, ms: number) => {
	await tx.execute(sql`SELECT 1`);
	now += ms;
};

beforeAll(async () => {
	db = await openTestDb();
});
afterAll(async () => {
	await db.$client.close();
});
beforeEach(() => {
	now = 0;
	lines.length = 0;
	clock = spyOn(performance, "now").mockImplementation(() => now);
	const execute = db.transaction.bind(db);
	transaction = spyOn(db, "transaction").mockImplementation(async (fn, options) => {
		now += 7;
		try {
			return await execute(fn, options);
		} finally {
			now += 3;
		}
	});
});
afterEach(() => {
	services["agentRuns.list"] = original;
	transaction.mockRestore();
	clock.mockRestore();
});

test("HTTP timings sum preparation, guard, final, and cleanup transactions but exclude external calls", async () => {
	services["agentRuns.list"] = prepared(
		"mutation",
		async (ctx) => {
			await ctx.newTx((tx) => query(tx, 500));
			await ctx.gh("interactive", []);
			ctx.afterCommit(async () => {
				await ctx.gh("interactive", []);
				await ctx.newTx((tx) => query(tx, 17));
			});
		},
		async (_ctx, tx) => {
			await query(tx, 5);
			return [];
		},
	);
	const { app } = createApp({ config, log, bus, runtime, transport: transport() });
	const response = await app.request("http://localhost/api/agent-runs");
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual([]);
	expect(response.headers.get("server-timing")).toBe("db;dur=534.00, lock;dur=28.00, queue;dur=0.00");
	expect(lines.find((line) => line.msg === "request")).toMatchObject({ ms: 2562, dbMs: 534, lockMs: 28, queueMs: 0 });
	expect(lines.filter((line) => line.msg === "long transaction")).toEqual([
		expect.objectContaining({
			service: "agentRuns.list",
			reqId: response.headers.get("x-request-id"),
			heldMs: 503,
			lockMs: 7,
		}),
	]);
});

for (const phase of ["prepare", "run"] as const) {
	test(`counts a rollback during ${phase}`, async () => {
		const failure = new Error("transaction failed");
		services["agentRuns.list"] = prepared(
			"read",
			async (ctx) => {
				await ctx.newTx(async (tx) => {
					await query(tx, 300);
					if (phase === "prepare") throw failure;
				});
			},
			async (_ctx, tx) => {
				await query(tx, 5);
				throw failure;
			},
		);
		const timing = createDbTiming();
		await expect(transport().call("agentRuns.list", systemContext(), {}, timing)).rejects.toBe(failure);
		expect(timing).toEqual({ ms: phase === "prepare" ? 303 : 311, lockMs: phase === "prepare" ? 7 : 14, queueMs: 0 });
	});
}

test("keeps concurrent requests and detached background transactions separate", async () => {
	const waiting = Promise.withResolvers<void>();
	const resume = Promise.withResolvers<void>();
	const startBackground = Promise.withResolvers<void>();
	services["agentRuns.list"] = prepared(
		"read",
		async (ctx, input) => {
			await ctx.newTx((tx) => query(tx, input.ms));
			if (input.wait) {
				waiting.resolve();
				await resume.promise;
			}
			ctx.background(async (background) => {
				await startBackground.promise;
				await background.newTx((tx) => query(tx, 700));
			});
		},
		async (_ctx, tx) => {
			await query(tx, 5);
			return [];
		},
	);
	const first = createDbTiming();
	const second = createDbTiming();
	const wire = transport();
	const pending = wire.call("agentRuns.list", systemContext(), { ms: 100, wait: true }, first);
	await waiting.promise;
	await wire.call("agentRuns.list", systemContext(), { ms: 200 }, second);
	resume.resolve();
	await pending;
	startBackground.resolve();
	await wire.close();
	expect(first).toEqual({ ms: 111, lockMs: 14, queueMs: 0 });
	expect(second).toEqual({ ms: 211, lockMs: 14, queueMs: 0 });
});
