import { expect, spyOn, test } from "bun:test";
import { createBus } from "../../events/bus.ts";
import { TICK_MS } from "../../gh/poller.ts";
import { startJobs } from "../../jobs.ts";
import { createCache } from "../cache.ts";
import { openTestDb } from "../testDb.ts";
import { createOperationDiagnostics, type OperationEvent } from "./operationDiagnostics";

test("the jobs boundary identifies successful and failed poller transactions", async () => {
	const db = await openTestDb();
	const events: OperationEvent[] = [];
	const timers = new Map<number, { fn: () => unknown; ms: number }>();
	let nextTimer = 1;
	const jobs = startJobs({
		db,
		cache: createCache(),
		actorCache: new Map(),
		publicUrl: "http://fixture.invalid",
		gh: Object.assign(async () => ({ ok: true as const, code: 0, stdout: "", stderr: "" }), {
			bin: "unused",
			timeoutMs: 1000,
		}),
		bus: createBus({ bootId: "poller-diagnostics" }),
		log: () => undefined,
		diagnostics: createOperationDiagnostics((event) => events.push(event)),
		clock: {
			now: () => new Date(0),
			setTimer: (fn, ms) => {
				const id = nextTimer++;
				timers.set(id, { fn, ms });
				return id;
			},
			clearTimer: (id) => {
				timers.delete(id);
			},
		},
	});
	try {
		await [...timers.values()].find((timer) => timer.ms === TICK_MS)!.fn();
		const starts = events.filter((event) => event.type === "begin");
		expect(starts.length).toBeGreaterThanOrEqual(6);
		expect(starts.every((event) => event.operation.name === "gh.poller" && event.operation.reqId === "gh.poller")).toBe(
			true,
		);
		expect(
			events
				.filter((event) => event.type === "end")
				.map((event) => event.id)
				.sort(),
		).toEqual(starts.map((event) => event.operation.id).sort());
		const failure = spyOn(db, "transaction").mockImplementation(async () => {
			throw new Error("poller database failure");
		});
		try {
			events.length = 0;
			await [...timers.values()].find((timer) => timer.ms === TICK_MS)!.fn();
			expect(events).toEqual([
				{ type: "begin", operation: expect.objectContaining({ name: "gh.poller", phase: "transaction.wait" }) },
				{ type: "end", id: expect.any(Number), at: expect.any(Number), outcome: "failure" },
			]);
		} finally {
			failure.mockRestore();
		}
	} finally {
		await jobs.stop();
		await db.$client.close();
	}
	expect(timers.size).toBe(0);
});
