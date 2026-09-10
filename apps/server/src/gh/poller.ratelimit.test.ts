import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { checkRun, graphqlReply, seedProject, seedRepo } from "../../test/fixtures";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import {
	authReply,
	pollerHarness,
	prListReply,
	rateLimitReply,
	type StubRepliesInput,
	seedLinkedPr,
} from "../../test/helpers/poller.ts";
import * as poller from "./poller.ts";

// The poller reads `gh api rate_limit` at most once every 5 minutes. While
// the remaining fraction is under 20 percent every interval is multiplied by
// 4, the poll intervals and the detection interval alike. One gh.status
// event marks the change into the low budget and one marks the way back, so
// the event reports a change and not a reading.

const LOW = rateLimitReply(750);
const FULL = rateLimitReply(5000);

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

const harness = (replies: StubRepliesInput) => {
	const p = pollerHarness(h.db, { "auth status": authReply, ...replies });
	restores.push(p.restore);
	return p;
};

const pendingReply = (number: number) =>
	graphqlReply([{ number, headRefName: "feature", checks: [checkRun("test", null)] }]);

// One pending pull request added while the poller runs, with its last fetch
// at the current reading of the clock.
const addPending = async (rootId: string, statusId: string, number: number, at: Date) =>
	seedLinkedPr(h.db, {
		projectId: rootId,
		rootId,
		statusId,
		pr: { number, ciState: "pending", checks: [{ name: "test", workflow: null, bucket: "pending", link: null }] },
		row: { fetched_at: at },
	});

describe("poller rate limit", () => {
	test("the rate limit is read at most once every 5 minutes", async () => {
		await seedProject(h.db);
		const p = harness({ "api rate_limit": FULL });
		const handle = poller.start(p.hook);

		await p.clock.advance(299_000);
		expect(p.countOf("api rate_limit")).toBe(0);

		await p.clock.advance(2_000);
		expect(p.countOf("api rate_limit")).toBe(1);

		await p.clock.advance(298_000);
		expect(p.countOf("api rate_limit")).toBe(1);

		await p.clock.advance(61_000);
		expect(p.countOf("api rate_limit")).toBe(2);
		await handle.stop();
	}, 30_000);

	test("a budget under 20 percent multiplies every poll interval by 4", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const p = harness({ "api rate_limit": LOW, "api graphql": pendingReply(31) });
		const handle = poller.start(p.hook);

		await p.clock.advance(310_000);
		expect(p.countOf("api rate_limit")).toBe(1);
		await addPending(rootId, statuses.started, 31, p.clock.now());

		await p.clock.advance(30_000);
		expect(p.countOf("api graphql")).toBe(0);

		await p.clock.advance(30_000);
		expect(p.countOf("api graphql")).toBe(0);

		await p.clock.advance(61_000);
		expect(p.countOf("api graphql")).toBe(1);
		await handle.stop();
	}, 30_000);

	test("a low budget emits one gh.status event per state change", async () => {
		await seedProject(h.db);
		const p = harness({ "api rate_limit": LOW });
		const handle = poller.start(p.hook);

		await p.clock.advance(660_000);

		expect(p.countOf("api rate_limit")).toBe(2);
		expect(p.events.filter((event) => event.type === "gh.status")).toHaveLength(1);
		await handle.stop();
	}, 30_000);

	test("a budget back above 20 percent restores the 30 second cadence", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const p = harness({ "api rate_limit": LOW, "api graphql": pendingReply(32) });
		const handle = poller.start(p.hook);

		await p.clock.advance(310_000);
		expect(p.events.filter((event) => event.type === "gh.status")).toHaveLength(1);
		p.stub.reply("api rate_limit", FULL);

		await p.clock.advance(300_000);
		expect(p.countOf("api rate_limit")).toBe(2);
		expect(p.events.filter((event) => event.type === "gh.status")).toHaveLength(2);

		await addPending(rootId, statuses.started, 32, p.clock.now());
		await p.clock.advance(31_000);
		expect(p.countOf("api graphql")).toBe(1);
		await handle.stop();
	}, 30_000);

	test("a rate_limit reply without a budget logs its raw text once and keeps the 1x cadence", async () => {
		await seedProject(h.db);
		const stdout = JSON.stringify({ resources: {} });
		const p = harness({ "api rate_limit": { stdout, stderr: "", exitCode: 0 } });
		const handle = poller.start(p.hook);

		await p.clock.advance(660_000);

		expect(p.countOf("api rate_limit")).toBe(2);
		const unexpected = p.logs.filter((line) => line[0] === "gh rate_limit reply has an unexpected shape");
		expect(unexpected).toEqual([["gh rate_limit reply has an unexpected shape", { stdout }]]);
		expect(p.events.filter((event) => event.type === "gh.status")).toHaveLength(0);
		await handle.stop();
	}, 30_000);

	test("a low budget multiplies the detection interval by 4", async () => {
		const { rootId } = await seedProject(h.db);
		await seedRepo(h.db, rootId, "acme", "web");
		const p = harness({ "api rate_limit": LOW, "pr list": prListReply([]) });
		const handle = poller.start(p.hook);

		await p.clock.advance(300_000);
		const beforeMultiplier = p.countOf("pr list");

		await p.clock.advance(420_000);
		expect(p.countOf("pr list")).toBe(beforeMultiplier);

		await p.clock.advance(20_000);
		expect(p.countOf("pr list")).toBe(beforeMultiplier + 1);
		await handle.stop();
	}, 30_000);
});
