import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { graphqlReply, seedProject } from "../../test/fixtures";
import { eventSink, testCtx, withEmit } from "../../test/helpers/ctx.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { freshHomeWithDirs } from "../../test/helpers/home.ts";
import {
	authReply,
	hoursBefore,
	pollerHarness,
	queriedRefs,
	refKey,
	secondsFrom,
	seedLinkedPr,
} from "../../test/helpers/poller.ts";
import { withTx } from "../db/tx.ts";
import { refresh } from "../services/pullRequests.ts";
import * as poller from "./poller.ts";

// The due selection keeps the poller off pull requests nobody watches: an
// open pull request on a done or canceled ticket, and a pull request that
// closed more than a day ago. A merged pull request stays due for a day, so
// a late check or a title edit still lands. pullRequests.refresh runs for a
// pull request whatever the cadence says.

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const restores: Array<() => void> = [];
afterEach(() => {
	for (const restore of restores.splice(0)) restore();
});

const harness = (replies: Record<string, { stdout: string; stderr: string; exitCode: number }>) => {
	const p = pollerHarness(h.db, replies);
	restores.push(p.restore);
	return p;
};

const tickOnce = async (p: ReturnType<typeof harness>) => {
	const handle = poller.start(p.hook);
	await handle.tick();
	await handle.stop();
};

describe("poller due selection", () => {
	test("an open pull request on a done ticket is never polled", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedLinkedPr(h.db, { projectId: rootId, rootId, statusId: statuses.done, pr: { number: 3 } });
		await seedLinkedPr(h.db, { projectId: rootId, rootId, statusId: statuses.started, pr: { number: 2 } });
		const p = harness({ "auth status": authReply, "api graphql": graphqlReply([{ number: 2 }]) });

		await tickOnce(p);

		expect(p.countOf("api graphql")).toBe(1);
		expect(queriedRefs(p.spawnsOf("api graphql")[0]!)).toEqual([refKey("acme", "web", 2)]);
	});

	test("an open pull request on a canceled ticket is never polled", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedLinkedPr(h.db, { projectId: rootId, rootId, statusId: statuses.canceled, pr: { number: 4 } });
		const p = harness({ "auth status": authReply, "api graphql": graphqlReply([{ number: 4 }]) });

		await tickOnce(p);

		expect(p.countOf("api graphql")).toBe(0);
	});

	test("a pull request merged inside a day is due and one closed for more than a day is not", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedLinkedPr(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.started,
			pr: { number: 5, state: "merged" },
			row: { merged_at: hoursBefore(2), updated_at: hoursBefore(2) },
		});
		await seedLinkedPr(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.started,
			pr: { number: 6, state: "closed" },
			row: { closed_at: hoursBefore(30), updated_at: hoursBefore(30) },
		});
		const p = harness({ "auth status": authReply, "api graphql": graphqlReply([{ number: 5, state: "MERGED" }]) });

		await tickOnce(p);

		expect(p.countOf("api graphql")).toBe(1);
		expect(queriedRefs(p.spawnsOf("api graphql")[0]!)).toEqual([refKey("acme", "web", 5)]);
	});

	test("refresh fetches a pull request the cadence would skip", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const { pr } = await seedLinkedPr(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.started,
			pr: { number: 7 },
			row: { fetched_at: secondsFrom(-1), content_hash: "stale" },
		});
		const p = harness({
			"auth status": authReply,
			"api graphql": graphqlReply([{ number: 7, title: "Fresh", url: "https://github.com/acme/web/pull/7" }]),
		});

		await tickOnce(p);
		expect(p.countOf("api graphql")).toBe(0);

		const handle = testCtx({ db: h.db, home: freshHomeWithDirs(), gh: p.hook.gh, now: p.clock.now });
		const { sink } = eventSink();
		const { result } = await withTx(h.db, (tx, emit) => refresh(withEmit(handle.ctx, emit), tx, { id: pr }), sink);

		expect(p.countOf("api graphql")).toBe(1);
		expect(result.title).toBe("Fresh");
		const [row] = (await h.db.execute(sql`SELECT title, fetched_at FROM pull_requests WHERE id = ${pr}`)).rows;
		expect(row).toMatchObject({ title: "Fresh" });
	});
});
