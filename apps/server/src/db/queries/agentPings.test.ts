import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { seedProject, seedRootWithStatuses } from "../../../test/fixtures";
import { freshDb, type TestDb } from "../../../test/helpers/db.ts";
import { insertPing, PING_HISTORY, recentPings } from "./agentPings.ts";

// The heartbeat writes one row per ping. The table is bounded: each insert
// deletes the rows of that project below the newest PING_HISTORY.

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const START = new Date("2026-09-10T12:00:00.000Z");

// Writes `n` pings for `projectId`, one minute apart, oldest first.
const write = (projectId: string, n: number, restarted = false) =>
	h.db.transaction(async (tx) => {
		for (let i = 0; i < n; i++) {
			await insertPing(tx, { projectId, at: new Date(START.getTime() + i * 60_000), restarted });
		}
	});

const read = (projectId: string, limit = PING_HISTORY) =>
	h.db.transaction((tx) => recentPings(tx, { projectId, limit }));

describe("agent pings", () => {
	test("a ping row holds the project, the time, and whether it forced a restart", async () => {
		const { rootId } = await seedProject(h.db);
		const written = await h.db.transaction((tx) => insertPing(tx, { projectId: rootId, at: START, restarted: true }));
		expect(written).toMatchObject({ projectId: rootId, at: START.toISOString(), restarted: true });
		expect(await read(rootId)).toEqual([written]);
	});

	test("recentPings answers the newest rows first and stops at the limit", async () => {
		const { rootId } = await seedProject(h.db);
		await write(rootId, 5);
		expect((await read(rootId)).map((ping) => ping.at)).toEqual([
			"2026-09-10T12:04:00.000Z",
			"2026-09-10T12:03:00.000Z",
			"2026-09-10T12:02:00.000Z",
			"2026-09-10T12:01:00.000Z",
			"2026-09-10T12:00:00.000Z",
		]);
		expect(await read(rootId, 2)).toHaveLength(2);
	});

	// A 15 s heartbeat writes 5760 rows a day. The insert trims, so the table
	// holds 200 rows per project and never grows.
	test("an insert keeps the newest 200 rows of its project and deletes the older ones", async () => {
		const { rootId } = await seedProject(h.db);
		await write(rootId, PING_HISTORY + 20);
		const kept = await read(rootId);
		expect(kept).toHaveLength(PING_HISTORY);
		expect(kept[0]!.at).toBe(new Date(START.getTime() + (PING_HISTORY + 19) * 60_000).toISOString());
		expect(kept.at(-1)!.at).toBe(new Date(START.getTime() + 20 * 60_000).toISOString());
	});

	test("the trim of one project leaves the rows of another project alone", async () => {
		const { rootId } = await seedProject(h.db);
		const other = await seedRootWithStatuses(h.db, "OPS");
		await write(other.rootId, 3);
		await write(rootId, PING_HISTORY + 5);
		expect(await read(other.rootId)).toHaveLength(3);
		expect(await read(rootId)).toHaveLength(PING_HISTORY);
	});
});
