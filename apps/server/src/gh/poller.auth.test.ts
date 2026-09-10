import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { graphqlReply, seedProject, seedRepo } from "../../test/fixtures";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { freshHome } from "../../test/helpers/home.ts";
import { authReply, pollerHarness, prListReply, seedLinkedPr, signedOutReply } from "../../test/helpers/poller.ts";
import * as poller from "./poller.ts";

// gh that is missing or signed out is a state, not a crash. start reads the
// state once. While the state is bad the poller rechecks with `gh auth
// status` at most once per 60 s, fetches nothing, detects nothing, and keeps
// ticking. One gh.status event and one log line mark a state change, so a
// state that holds writes nothing more.

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

const harness = (
	replies: Record<string, { stdout: string; stderr: string; exitCode: number }>,
	options: { bin?: string } = {},
) => {
	const p = pollerHarness(h.db, replies, options);
	restores.push(p.restore);
	return p;
};

// One open pull request on a started ticket, so a poller with a working gh
// would fetch on its first tick.
const seedDue = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const seeded = await seedLinkedPr(h.db, {
		projectId: rootId,
		rootId,
		statusId: statuses.started,
		pr: { number: 21 },
	});
	return { rootId, ...seeded };
};

const ghEvents = (p: ReturnType<typeof harness>) => p.events.filter((event) => event.type === "gh.status");

describe("poller gh state", () => {
	test("an unauthenticated gh skips the tick and rechecks at most once per 60 seconds", async () => {
		const { pr } = await seedDue();
		const p = harness({ "auth status": signedOutReply });
		const handle = poller.start(p.hook);

		await p.clock.advance(50_000);
		expect(p.countOf("auth status")).toBe(1);

		await p.clock.advance(50_000);
		expect(p.countOf("auth status")).toBe(2);
		expect(p.countOf("api graphql")).toBe(0);
		const [row] = (await h.db.execute(sql`SELECT fetched_at, content_hash FROM pull_requests WHERE id = ${pr}`)).rows;
		expect(row).toMatchObject({ fetched_at: null, content_hash: null });
		await handle.stop();
	});

	test("an unauthenticated gh emits one gh.status event and one log line per state change", async () => {
		await seedDue();
		const p = harness({ "auth status": signedOutReply });
		const handle = poller.start(p.hook);

		await p.clock.advance(200_000);

		expect(ghEvents(p)).toHaveLength(1);
		expect(ghEvents(p)[0]).toMatchObject({ type: "gh.status", ok: false, reason: "unauthenticated" });
		expect(p.logs).toHaveLength(1);
		expect(JSON.stringify(p.logs[0])).toContain("unauthenticated");
		await handle.stop();
	});

	test("a gh that signs back in emits one gh.status event and resumes polling", async () => {
		await seedDue();
		const p = harness({ "auth status": signedOutReply, "api graphql": graphqlReply([{ number: 21 }]) });
		const handle = poller.start(p.hook);

		await p.clock.advance(30_000);
		expect(ghEvents(p)).toHaveLength(1);
		p.stub.reply("auth status", authReply);

		await p.clock.advance(45_000);

		expect(ghEvents(p)).toHaveLength(2);
		expect(ghEvents(p)[1]).toMatchObject({ type: "gh.status", ok: true });
		expect(p.logs).toHaveLength(2);
		expect(p.countOf("api graphql")).toBe(1);
		await handle.stop();
	});

	test("a missing gh binary reports reason missing once and keeps the loop alive", async () => {
		await seedDue();
		const rejections: unknown[] = [];
		const onRejection = (reason: unknown) => void rejections.push(reason);
		process.on("unhandledRejection", onRejection);
		const p = harness({ "auth status": authReply }, { bin: join(freshHome(), "no-such-gh") });
		const handle = poller.start(p.hook);

		await p.clock.advance(200_000);

		expect(ghEvents(p)).toHaveLength(1);
		expect(ghEvents(p)[0]).toMatchObject({ type: "gh.status", ok: false, reason: "missing" });
		expect(p.logs).toHaveLength(1);
		expect(p.clock.timers()).toHaveLength(1);
		process.off("unhandledRejection", onRejection);
		expect(rejections).toEqual([]);
		await handle.stop();
	});

	test("detection is skipped while gh is unauthenticated", async () => {
		const { rootId } = await seedDue();
		await seedRepo(h.db, rootId, "acme", "web");
		const p = harness({ "auth status": signedOutReply, "pr list": prListReply([]) });
		const handle = poller.start(p.hook);

		await p.clock.advance(200_000);

		expect(p.countOf("pr list")).toBe(0);
		await handle.stop();
	});
});
