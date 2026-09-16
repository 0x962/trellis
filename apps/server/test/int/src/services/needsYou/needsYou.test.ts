import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import * as comments from "../../../../../src/services/comments.ts";
import * as inbox from "../../../../../src/services/needsYou/needsYou.ts";
import * as tickets from "../../../../../src/services/tickets.ts";
import { dana, seedProject, seedTicket } from "../../../../fixtures";
import { type Harness, secondsAfter, serviceHarness } from "../../../../helpers/services.ts";

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());
const now = new Date("2026-09-09T12:00:00Z");
const read = (input = {}, at = now, actor = dana) => h.run((ctx, tx) => inbox.list(ctx, tx, input), { now: at, actor });
const seed = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const ticket = await seedTicket(h.db, { rootId, projectId: rootId, statusId: statuses.humanReview });
	await h.rebuild();
	return { ticket, statuses, rootId };
};

test("review and mentions are separate items and completed work leaves both sections", async () => {
	const { ticket } = await seed();
	const comment = await h.run((ctx, tx) => comments.create(ctx, tx, { ticket, body: "@dana please check this" }));
	expect((await read({ section: "review" })).items.map((item) => item.ticket.id)).toEqual([ticket]);
	expect((await read({ section: "mentioned" })).items.map((item) => item.comment?.id)).toEqual([comment.id]);
	await h.run((ctx, tx) => comments.resolve(ctx, tx, { id: comment.id, resolved: true }));
	expect((await read({ section: "mentioned" })).items).toEqual([]);
	await h.run((ctx, tx) => tickets.move(ctx, tx, { ticket, status: "done" }));
	expect((await read()).items).toEqual([]);
});

test("mentions respect full names, code, deleted text, and the current person", async () => {
	const { ticket } = await seed();
	for (const body of ["`@dana`", "```\n@dana\n```", "mail@dana.com", "@dana-extra", "@someone"]) {
		await h.run((ctx, tx) => comments.create(ctx, tx, { ticket, body }));
	}
	const comment = await h.run((ctx, tx) => comments.create(ctx, tx, { ticket, body: "@DANA please check" }));
	expect((await read({ section: "mentioned" })).items).toHaveLength(1);
	await h.run((ctx, tx) => comments.update(ctx, tx, { id: comment.id, body: "No mention" }));
	expect((await read({ section: "mentioned" })).items).toEqual([]);
});

test("ignore is personal and a new review cycle or new comment returns", async () => {
	const { ticket } = await seed();
	const item = (await read()).items[0]!;
	await h.run((ctx, tx) => inbox.update(ctx, tx, { id: item.id, action: "ignore" }));
	expect((await read()).items).toEqual([]);
	expect((await read({ visibility: "ignored" })).items).toHaveLength(1);
	expect((await read({}, now, { kind: "human", name: "alex" })).items).toHaveLength(1);
	await h.run((ctx, tx) => tickets.move(ctx, tx, { ticket, status: "in-progress" }));
	await h.run((ctx, tx) => tickets.move(ctx, tx, { ticket, status: "human-review" }));
	expect((await read()).items).toHaveLength(1);
	expect((await read()).items[0]!.id).not.toBe(item.id);
	await h.run((ctx, tx) => comments.create(ctx, tx, { ticket, body: "@dana first question" }));
	const mention = (await read({ section: "mentioned" })).items[0]!;
	await h.run((ctx, tx) => inbox.update(ctx, tx, { id: mention.id, action: "ignore" }));
	await h.run((ctx, tx) => comments.create(ctx, tx, { ticket, body: "@dana another question" }));
	expect((await read({ section: "mentioned" })).items).toHaveLength(1);
});

test("snooze expires exactly on time, persists, and supports restore", async () => {
	await seed();
	const item = (await read()).items[0]!;
	const until = new Date(now.getTime() + 60000).toISOString();
	await h.run((ctx, tx) => inbox.update(ctx, tx, { id: item.id, action: "snooze", until }));
	expect((await read()).items).toEqual([]);
	expect((await read({ visibility: "snoozed" })).items[0]!.snoozedUntil).toBe(until);
	const summary = await h.run((ctx, tx) => inbox.summary(ctx, tx, {}));
	expect(summary.active).toBe(0);
	expect(summary.nextWakeAt).toBe(until);
	expect((await read({}, new Date(until))).items).toHaveLength(1);
	await h.run((ctx, tx) => inbox.update(ctx, tx, { id: item.id, action: "restore" }));
	expect((await read()).items).toHaveLength(1);
	expect(h.flushed.some((event) => event.type === "needs-you.changed")).toBe(true);
});

test("completion while snoozed does not return an item when its timer expires", async () => {
	const { ticket } = await seed();
	const item = (await read()).items[0]!;
	const until = new Date(now.getTime() + 60000).toISOString();
	await h.run((ctx, tx) => inbox.update(ctx, tx, { id: item.id, action: "snooze", until }));
	await h.run((ctx, tx) => tickets.move(ctx, tx, { ticket, status: "done" }));
	expect((await read({}, new Date(until))).items).toEqual([]);
	expect((await read({ visibility: "snoozed" })).items).toEqual([]);
});

test("all sort orders apply before pagination and use stable ties", async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const values = [
		{ title: "Zebra", priority: "low", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-08-01") },
		{ title: "Alpha", priority: "urgent", createdAt: new Date("2026-03-01"), updatedAt: new Date("2026-07-01") },
		{ title: "Beta", priority: "urgent", createdAt: new Date("2026-02-01"), updatedAt: new Date("2026-06-01") },
		{ title: "None", priority: "none", createdAt: new Date("2025-01-01"), updatedAt: new Date("2026-09-01") },
	];
	for (const value of values)
		await seedTicket(h.db, { ...value, rootId, projectId: rootId, statusId: statuses.humanReview });
	await h.rebuild();
	const orders = {
		priority: ["Beta", "Alpha", "Zebra", "None"],
		"-priority": ["Zebra", "Beta", "Alpha", "None"],
		createdAt: ["None", "Zebra", "Beta", "Alpha"],
		"-createdAt": ["Alpha", "Beta", "Zebra", "None"],
		updatedAt: ["Beta", "Alpha", "Zebra", "None"],
		"-updatedAt": ["None", "Zebra", "Alpha", "Beta"],
		title: ["Alpha", "Beta", "None", "Zebra"],
		"-title": ["Zebra", "None", "Beta", "Alpha"],
	};
	for (const [sort, expected] of Object.entries(orders)) {
		const first = await read({ sort, limit: 2 });
		const second = await read({ sort, limit: 2, cursor: first.nextCursor });
		expect(first.total).toBe(4);
		expect(second.total).toBe(4);
		expect([...first.items, ...second.items].map((item) => item.ticket.title)).toEqual(expected);
		expect(second.nextCursor).toBeNull();
	}
	await h.db.execute(sql`UPDATE tickets SET priority='high',created_at='2026-01-01',updated_at='2026-01-01'`);
	const all = await read({ limit: 20 });
	const a = await read({ limit: 2 });
	const b = await read({ limit: 2, cursor: a.nextCursor });
	expect([...a.items, ...b.items].map((item) => item.id)).toEqual(all.items.map((item) => item.id));
});

test("reply mentions follow root resolution and deletion", async () => {
	const { ticket } = await seed();
	const root = await h.run((ctx, tx) => comments.create(ctx, tx, { ticket, body: "Question" }));
	const reply = await h.run((ctx, tx) =>
		comments.create(ctx, tx, { ticket, parentId: root.id, body: "@dana please check" }),
	);
	expect((await read({ section: "mentioned" })).items[0]!.comment?.threadId).toBe(root.id);
	await h.run((ctx, tx) => comments.resolve(ctx, tx, { id: reply.id, resolved: true }));
	expect((await read({ section: "mentioned" })).items).toHaveLength(0);
	await h.run((ctx, tx) => comments.resolve(ctx, tx, { id: root.id, resolved: false }));
	expect((await read({ section: "mentioned" })).items).toHaveLength(1);
	await h.run((ctx, tx) => comments.delete(ctx, tx, { id: reply.id }));
	expect((await read({ section: "mentioned" })).items).toHaveLength(0);
});

test("done clears older mentions permanently and permits newer replies on completed tickets", async () => {
	const { ticket } = await seed();
	const root = await h.run((ctx, tx) => comments.create(ctx, tx, { ticket, body: "@dana initial question" }));
	await h.run((ctx, tx) => tickets.move(ctx, tx, { ticket, status: "done" }), { now: secondsAfter(1) });
	expect((await read({ section: "mentioned" }, secondsAfter(1))).items).toEqual([]);
	const reply = await h.run(
		(ctx, tx) => comments.create(ctx, tx, { ticket, parentId: root.id, body: "@dana follow-up question" }),
		{ now: secondsAfter(2) },
	);
	expect((await read({ section: "mentioned" }, secondsAfter(2))).items.map((item) => item.comment?.id)).toEqual([
		reply.id,
	]);
	await h.run((ctx, tx) => tickets.update(ctx, tx, { ticket, status: "in-progress" }), { now: secondsAfter(3) });
	expect((await read({ section: "mentioned" }, secondsAfter(3))).items.map((item) => item.comment?.id)).toEqual([
		reply.id,
	]);
	await h.run((ctx, tx) => comments.resolve(ctx, tx, { id: root.id, resolved: true }), { now: secondsAfter(4) });
	expect((await read({ section: "mentioned" }, secondsAfter(4))).items).toEqual([]);
	await h.run((ctx, tx) => comments.resolve(ctx, tx, { id: root.id, resolved: false }), { now: secondsAfter(5) });
	expect((await read({ section: "mentioned" }, secondsAfter(5))).items.map((item) => item.comment?.id)).toEqual([
		reply.id,
	]);
	await h.run((ctx, tx) => tickets.updateMany(ctx, tx, { tickets: [ticket], status: "done" }), {
		now: secondsAfter(6),
	});
	expect((await read({ section: "mentioned" }, secondsAfter(6))).items).toEqual([]);
});

test("older mentions leave snoozed and ignored views after done and do not return after reopen", async () => {
	const { ticket } = await seed();
	await h.run((ctx, tx) => comments.create(ctx, tx, { ticket, body: "@dana snoozed question" }));
	await h.run((ctx, tx) => comments.create(ctx, tx, { ticket, body: "@dana ignored question" }));
	const [snoozed, ignored] = (await read({ section: "mentioned" })).items;
	await h.run((ctx, tx) =>
		inbox.update(ctx, tx, { id: snoozed!.id, action: "snooze", until: secondsAfter(60).toISOString() }),
	);
	await h.run((ctx, tx) => inbox.update(ctx, tx, { id: ignored!.id, action: "ignore" }));
	await h.run((ctx, tx) => tickets.move(ctx, tx, { ticket, status: "done" }), { now: secondsAfter(1) });
	await h.run((ctx, tx) => tickets.move(ctx, tx, { ticket, status: "in-progress" }), { now: secondsAfter(2) });
	for (const visibility of ["active", "snoozed", "ignored"]) {
		expect((await read({ section: "mentioned", visibility }, secondsAfter(2))).items).toEqual([]);
	}
	expect((await read({ section: "mentioned" }, secondsAfter(60))).items).toEqual([]);
	const summary = await h.run((ctx, tx) => inbox.summary(ctx, tx, {}), { now: secondsAfter(60) });
	expect(summary).toEqual({ active: 0, review: 0, mentioned: 0, snoozed: 0, ignored: 0, nextWakeAt: null });
});

test("only comments strictly before a done transition are cleared by completion", async () => {
	const { ticket } = await seed();
	const comment = await h.run((ctx, tx) => comments.create(ctx, tx, { ticket, body: "@dana question" }));
	await h.run((ctx, tx) => tickets.move(ctx, tx, { ticket, status: "canceled" }), { now: secondsAfter(1) });
	expect((await read({ section: "mentioned" }, secondsAfter(1))).items.map((item) => item.comment?.id)).toEqual([
		comment.id,
	]);
	await h.run((ctx, tx) => tickets.move(ctx, tx, { ticket, status: "done" }), { now: secondsAfter(2) });
	const sameTime = await h.run(
		(ctx, tx) => comments.create(ctx, tx, { ticket, body: "@dana question at completion" }),
		{ now: secondsAfter(2) },
	);
	expect((await read({ section: "mentioned" }, secondsAfter(2))).items.map((item) => item.comment?.id)).toEqual([
		sameTime.id,
	]);
});

test("a cursor cannot cross sort orders, sections, or actors", async () => {
	const { ticket } = await seed();
	await h.run((ctx, tx) => comments.create(ctx, tx, { ticket, body: "@dana question" }));
	const cursor = (await read({ limit: 1 })).nextCursor;
	expect(cursor).not.toBeNull();
	for (const input of [{ sort: "title" }, { section: "mentioned" }])
		await expect(read({ ...input, cursor })).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await expect(read({ cursor }, now, { kind: "human", name: "alex" })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
});
