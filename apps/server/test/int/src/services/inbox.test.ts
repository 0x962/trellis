import { describe, expect, test } from "bun:test";
import * as inbox from "../../../../src/services/inbox.ts";
import {
	type ActorRef,
	claude,
	dana,
	hoursAgo,
	linkPr,
	type StatusIds,
	seedActivity,
	seedChild,
	seedPr,
	seedProject,
	seedSetting,
	seedTicket,
} from "../../../fixtures";
import { expectErrorData, ticketHarness } from "../../../helpers/services.ts";

const h = ticketHarness();

const get = (input: Record<string, unknown> = {}) => h.as(dana)((ctx, tx) => inbox.get(ctx, tx, input));

const ids = (section: { items: Array<{ id: string }> }) => section.items.map((item) => item.id);

// A root with its six statuses and the stalled threshold at 24 hours.
const seed = async () => {
	const project = await seedProject(h.db);
	await seedSetting(h.db, "stalledHours", 24);
	const inProject =
		(projectId: string) =>
		(statusId: string, extra: Record<string, unknown> = {}) =>
			seedTicket(h.db, { projectId, rootId: project.rootId, statusId, ...extra });
	return { ...project, inProject };
};

// The activity row a status move into a done category leaves behind.
const doneMove = (rootId: string, projectId: string, ticketId: string, actor: ActorRef, statuses: StatusIds) =>
	seedActivity(h.db, {
		rootId,
		projectId,
		ticketId,
		actor,
		field: "status",
		fromValue: "In Progress",
		toValue: "Done",
		meta: { fromId: statuses.started, toId: statuses.done, fromCategory: "started", toCategory: "done" },
		createdAt: new Date(Date.now() - 60_000),
	});

describe("inbox.get", () => {
	test("the review section holds human-reviewer tickets oldest first", async () => {
		const { rootId, statuses, inProject } = await seed();
		const seedIn = inProject(rootId);
		const newest = await seedIn(statuses.humanReview, { updatedAt: hoursAgo(1) });
		const oldest = await seedIn(statuses.humanReview, { updatedAt: hoursAgo(3) });
		await seedIn(statuses.agentReview, { updatedAt: hoursAgo(5) });
		const { result } = await get();
		expect(ids(result.review)).toEqual([oldest, newest]);
		expect(result.review.total).toBe(2);
	});

	test("the failingCi section holds tickets with a failing open pull request", async () => {
		const { rootId, statuses, inProject } = await seed();
		const seedIn = inProject(rootId);
		const failing = await seedIn(statuses.started);
		const passing = await seedIn(statuses.started);
		await linkPr(h.db, failing, await seedPr(h.db, { number: 1, ciState: "fail" }));
		await linkPr(h.db, passing, await seedPr(h.db, { number: 2, ciState: "pass" }));
		const { result } = await get();
		expect(ids(result.failingCi)).toEqual([failing]);
	});

	test("the stalled section reads the stalledHours setting", async () => {
		const { rootId, statuses, inProject } = await seed();
		const seedIn = inProject(rootId);
		const stale = await seedIn(statuses.started, { updatedAt: hoursAgo(30) });
		await seedIn(statuses.started, { updatedAt: hoursAgo(2) });
		const { result } = await get();
		expect(ids(result.stalled)).toEqual([stale]);
	});

	test("a changed stalledHours setting changes the stalled membership", async () => {
		const { rootId, statuses, inProject } = await seed();
		const stale = await inProject(rootId)(statuses.started, { updatedAt: hoursAgo(30) });
		expect(ids((await get()).result.stalled)).toEqual([stale]);
		await seedSetting(h.db, "stalledHours", 48);
		expect(ids((await get()).result.stalled)).toEqual([]);
	});

	test("the doneByAgentsToday section counts the agent moves since midnight", async () => {
		const { rootId, statuses, inProject } = await seed();
		const seedIn = inProject(rootId);
		const byAgent = await seedIn(statuses.done, { completedAt: new Date() });
		const byHuman = await seedIn(statuses.done, { completedAt: new Date() });
		await doneMove(rootId, rootId, byAgent, claude, statuses);
		await doneMove(rootId, rootId, byHuman, dana, statuses);
		const { result } = await get();
		expect(ids(result.doneByAgentsToday)).toEqual([byAgent]);
	});

	test("a project ref narrows every inbox section", async () => {
		const { rootId, statuses, inProject } = await seed();
		const webId = await seedChild(h.db, rootId, rootId, "web");
		const expected: string[] = [];
		for (const [prNumber, projectId, keep] of [
			[1, rootId, false],
			[2, webId, true],
		] as const) {
			const seedIn = inProject(projectId);
			const review = await seedIn(statuses.humanReview);
			const failing = await seedIn(statuses.started);
			await linkPr(h.db, failing, await seedPr(h.db, { number: prNumber, ciState: "fail" }));
			const stale = await seedIn(statuses.started, { updatedAt: hoursAgo(30) });
			const done = await seedIn(statuses.done, { completedAt: new Date() });
			await doneMove(rootId, projectId, done, claude, statuses);
			if (keep) expected.push(review, failing, stale, done);
		}
		const { result } = await get({ project: "CDE.web" });
		expect(ids(result.review)).toEqual([expected[0]!]);
		expect(ids(result.failingCi)).toEqual([expected[1]!]);
		expect(ids(result.stalled)).toEqual([expected[2]!]);
		expect(ids(result.doneByAgentsToday)).toEqual([expected[3]!]);
	});

	test("an inbox section caps at 100 items and reports the whole total", async () => {
		const { rootId, statuses, inProject } = await seed();
		const seedIn = inProject(rootId);
		for (let i = 0; i < 120; i += 1) await seedIn(statuses.humanReview);
		const { result } = await get();
		expect(result.review.items).toHaveLength(100);
		expect(result.review.total).toBe(120);
	});

	test("inbox with an unknown project ref throws NOT_FOUND", async () => {
		await seed();
		const data = await expectErrorData(get({ project: "NOPE" }), "NOT_FOUND");
		expect(data).toEqual({ kind: "project", ref: "NOPE" });
	});
});
