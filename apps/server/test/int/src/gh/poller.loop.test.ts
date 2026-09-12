import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { graphqlReply, seedProject } from "../../../fixtures";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { authReply, pollerHarness, seedLinkedPr } from "../../../helpers/poller.ts";
import * as poller from "../../../../src/gh/poller.ts";

// The loop is one setTimeout chain. A tick runs every 10 s, one tick runs at
// a time, and the next timer is armed after the running tick settles. start
// runs one `gh auth status` for the boot state and arms the first timer; the
// first tick waits for that answer before it fetches.
//
// The fake clock waits for what a timer returns, so a tick settles inside
// `advance` and a test reads the spawn log right after it.

const TICK_MS = 10_000;

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

// One open pull request on a started ticket, so a tick that runs fetches it.
const harness = async (delayMs?: number) => {
	const { rootId, statuses } = await seedProject(h.db);
	const { pr } = await seedLinkedPr(h.db, {
		projectId: rootId,
		rootId,
		statusId: statuses.started,
		pr: { number: 12 },
	});
	const p = pollerHarness(h.db, {
		"auth status": authReply,
		"api graphql": { ...graphqlReply([{ number: 12, title: "Fresh" }]), delayMs },
	});
	restores.push(p.restore);
	return { ...p, pr };
};

describe("poller loop", () => {
	test("start arms one 10 s timer and runs no tick before it fires", async () => {
		const p = await harness();

		const handle = poller.start(p.hook);

		expect(p.clock.timers()).toHaveLength(1);
		expect(p.clock.timers()[0]!.at - p.clock.nowMs()).toBe(TICK_MS);
		expect(typeof handle.tick).toBe("function");
		expect(typeof handle.stop).toBe("function");
		await p.clock.advance(TICK_MS - 1);
		expect(p.countOf("api graphql")).toBe(0);
		await handle.stop();
	});

	test("a slow tick never overlaps the next tick", async () => {
		const p = await harness(250);
		const handle = poller.start(p.hook);

		const inFlight = handle.tick();
		await p.clock.advance(TICK_MS);
		await p.clock.advance(TICK_MS);
		expect(p.countOf("api graphql")).toBe(1);
		expect(p.clock.timers()).toHaveLength(1);

		await inFlight;
		expect(p.countOf("api graphql")).toBe(1);
		expect(p.clock.timers()).toHaveLength(1);
		await handle.stop();
	});

	test("stop waits for the in-flight tick and runs no tick after it", async () => {
		const p = await harness(250);
		const handle = poller.start(p.hook);

		const inFlight = handle.tick();
		await handle.stop();

		expect(p.clock.timers()).toHaveLength(0);
		const settled = p.spawns().length;
		expect(p.countOf("api graphql")).toBe(1);
		await inFlight;
		await p.clock.advance(60_000);
		expect(p.spawns()).toHaveLength(settled);
	});
});
