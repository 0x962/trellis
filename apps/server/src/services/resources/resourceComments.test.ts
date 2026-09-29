import { afterAll, beforeAll, expect, test } from "bun:test";
import { type ActorRef, ResourceCommentThreadSchema, type TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { createCache } from "../../db/cache.ts";
import { resourceComments } from "../../db/tables/resourceComments.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx } from "../support.ts";
import { anchors, create, edit, list, remove, reply, resolve } from "./resourceComments.ts";
import { add, remove as removeResource } from "./resources.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let cache: ReturnType<typeof createCache>;
const human = { name: "dana", kind: "human" as const };
const agent = { name: "comment-test", kind: "agent" as const };
const projectId = ulid();
const epicId = ulid();
const now = new Date("2026-09-21T10:00:00.000Z");
const events: TrellisEvent[] = [];

const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const contextOf = (actor: ActorRef) =>
	({
		actor,
		now: () => now,
		emit: (event: TrellisEvent) => events.push(event),
		core: { actor, cache, now },
	}) as unknown as IoCtx;

let asHuman: IoCtx;
let asAgent: IoCtx;

const anchor = { quote: "second line", prefix: "The first line.\nThe ", suffix: " holds a claim." };

const newDoc = () =>
	inTx((tx) =>
		add(asAgent, tx, {
			epic: "TRL/comments",
			kind: "doc",
			name: "Plan",
			body: "The first line.\nThe second line holds a claim.",
		}),
	);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES (${agent.name}, ${agent.kind}, ${now}, ${now})`);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'TRL', 'trl', 'Trellis', ${now}, ${now})`);
	await db.execute(sql`INSERT INTO epics (
		id, project_id, slug, name, actor_name, actor_kind, created_at, updated_at, actor_id) VALUES (${epicId}, ${projectId}, 'comments', 'Comments', ${agent.name}, ${agent.kind}, ${now}, ${now}, (SELECT id FROM actors WHERE ARRAY[kind, name] = ARRAY[${agent.kind}, ${agent.name}]::text[]))`);
	cache = createCache();
	await inTx(cache.rebuild);
	asHuman = contextOf(human);
	asAgent = contextOf(agent);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("a thread keeps its anchor, its replies in order, and its resolve state", async () => {
	const doc = await newDoc();
	events.length = 0;
	const thread = await inTx((tx) => create(asHuman, tx, { resource: doc.id, anchor, body: "Is this true?" }));
	expect(thread).toMatchObject({
		resourceId: doc.id,
		anchor,
		textRemoved: false,
		resolved: null,
		comments: [{ id: thread.id, body: "Is this true?", actor: human }],
	});
	expect(events).toEqual([{ type: "resource-comments.changed", projectId, resourceId: doc.id }]);

	await inTx((tx) => reply(asAgent, tx, { thread: thread.id, body: "Yes, the test proves it." }));
	const resolved = await inTx((tx) => resolve(asAgent, tx, { thread: thread.id, resolved: true }));
	expect(resolved.comments.map((comment) => [comment.actor.name, comment.body])).toEqual([
		["dana", "Is this true?"],
		["comment-test", "Yes, the test proves it."],
	]);
	expect(resolved.resolved).toEqual({ actor: agent, at: now.toISOString() });

	const reopened = await inTx((tx) => resolve(asHuman, tx, { thread: thread.id, resolved: false }));
	expect(reopened.resolved).toBeNull();
	expect(await inTx((tx) => list(asAgent, tx, { resource: doc.id }))).toEqual([reopened]);
});

test("an anchor move stores the new text and the text removed flag, and refuses a thread of another document", async () => {
	const doc = await newDoc();
	const other = await newDoc();
	const thread = await inTx((tx) => create(asHuman, tx, { resource: doc.id, anchor, body: "Check this." }));
	const moved = { quote: "second line", prefix: "A new first line.\nThe ", suffix: " holds a claim." };

	const [after] = await inTx((tx) =>
		anchors(asHuman, tx, { resource: doc.id, anchors: [{ thread: thread.id, anchor: moved, textRemoved: true }] }),
	);
	expect(after).toMatchObject({ id: thread.id, anchor: moved, textRemoved: true });
	await expect(
		inTx((tx) =>
			anchors(asHuman, tx, { resource: other.id, anchors: [{ thread: thread.id, anchor, textRemoved: false }] }),
		),
	).rejects.toThrow();
});

test("501 anchor moves preserve thread identities, other anchors, and transaction rollback", async () => {
	const doc = await newDoc();
	const other = await newDoc();
	const untouched = await inTx((tx) => create(asHuman, tx, { resource: doc.id, anchor, body: "Keep this." }));
	const foreign = await inTx((tx) => create(asHuman, tx, { resource: other.id, anchor, body: "Other document." }));
	const ids = Array.from({ length: 501 }, () => ulid());
	await inTx(async (tx) => {
		const { rows: actors } = await tx.execute<{ id: string }>(
			sql`SELECT id FROM actors WHERE ARRAY[kind, name] = ARRAY[${human.kind}, ${human.name}]::text[]`,
		);
		await tx.insert(resourceComments).values(
			ids.map((id) => ({
				id,
				threadId: id,
				resourceId: doc.id,
				body: `Comment ${id}`,
				...anchor,
				actorId: actors[0]!.id,
				actorName: human.name,
				actorKind: human.kind,
				createdAt: now,
				updatedAt: now,
			})),
		);
	});
	await inTx((tx) => reply(asAgent, tx, { thread: ids[500]!, body: "Keep the reply." }));
	const before = await inTx((tx) => list(asHuman, tx, { resource: doc.id }));
	const moved = ids.map((thread, index) => ({
		thread,
		anchor: { quote: `Moved quote ${index}`, prefix: "New prefix ", suffix: " new suffix" },
		textRemoved: index % 2 === 0,
	}));
	events.length = 0;
	const saved = await inTx((tx) => anchors(asHuman, tx, { resource: doc.id, anchors: moved }));
	const byId = new Map(moved.map((move) => [move.thread, move]));
	expect(saved).toEqual(
		before.map((thread) => {
			const move = byId.get(thread.id);
			return move === undefined ? thread : { ...thread, anchor: move.anchor, textRemoved: move.textRemoved };
		}),
	);
	expect(saved.find((thread) => thread.id === untouched.id)).toEqual(untouched);
	expect(events).toEqual([{ type: "resource-comments.changed", projectId, resourceId: doc.id }]);
	expect(await inTx((tx) => list(asHuman, tx, { resource: doc.id }))).toEqual(saved);
	expect(await inTx((tx) => list(asHuman, tx, { resource: other.id }))).toEqual([foreign]);

	events.length = 0;
	await expect(
		inTx((tx) =>
			anchors(asHuman, tx, {
				resource: doc.id,
				anchors: [
					...ids.map((thread) => ({ thread, anchor, textRemoved: false })),
					{ thread: foreign.id, anchor, textRemoved: false },
				],
			}),
		),
	).rejects.toThrow();
	expect(await inTx((tx) => list(asHuman, tx, { resource: doc.id }))).toEqual(saved);
	expect(await inTx((tx) => list(asHuman, tx, { resource: other.id }))).toEqual([foreign]);
	expect(events).toEqual([]);
});

test("a person edits and deletes their own comment only, and the first comment takes its thread", async () => {
	const doc = await newDoc();
	const thread = await inTx((tx) => create(asHuman, tx, { resource: doc.id, anchor, body: "Frist" }));
	const answered = await inTx((tx) => reply(asAgent, tx, { thread: thread.id, body: "A reply" }));
	const replyId = answered.comments[1]!.id;

	const edited = await inTx((tx) => edit(asHuman, tx, { id: thread.id, body: "First" }));
	expect(edited.comments[0]!.body).toBe("First");
	await expect(inTx((tx) => edit(asHuman, tx, { id: replyId, body: "Changed" }))).rejects.toThrow(
		"Edit your own comment only.",
	);
	await expect(inTx((tx) => remove(asHuman, tx, { id: replyId }))).rejects.toThrow("Delete your own comment only.");

	await inTx((tx) => remove(asAgent, tx, { id: replyId }));
	expect((await inTx((tx) => list(asHuman, tx, { resource: doc.id })))[0]!.comments).toHaveLength(1);
	await inTx((tx) => reply(asAgent, tx, { thread: thread.id, body: "Another reply" }));
	await inTx((tx) => remove(asHuman, tx, { id: thread.id }));
	expect(await inTx((tx) => list(asHuman, tx, { resource: doc.id }))).toEqual([]);
});

test("a reply is not a thread, and a removed document takes its comments", async () => {
	const doc = await newDoc();
	const thread = await inTx((tx) => create(asHuman, tx, { resource: doc.id, anchor, body: "Why?" }));
	const answered = await inTx((tx) => reply(asAgent, tx, { thread: thread.id, body: "Because." }));
	await expect(
		inTx((tx) => reply(asHuman, tx, { thread: answered.comments[1]!.id, body: "A reply to a reply" })),
	).rejects.toThrow();

	await inTx((tx) => removeResource(asAgent, tx, { id: doc.id }));
	const [left] = await db
		.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM resource_comments WHERE resource_id = ${doc.id}`)
		.then((result) => result.rows);
	expect(left!.count).toBe(0);
});

test("long multibyte comment bodies and quotes survive create, reply, edit, and read", async () => {
	const doc = await newDoc();
	const body = `Start\n${"漢é🙂".repeat(4_000)}\nEnd`;
	const quote = `First\n${"文é🙂".repeat(1_000)}\nLast`;
	const longAnchor = { ...anchor, quote };
	const thread = await inTx((tx) => create(asHuman, tx, { resource: doc.id, anchor: longAnchor, body }));
	expect(ResourceCommentThreadSchema.parse(thread).anchor).toEqual(longAnchor);
	expect(thread.comments[0]!.body).toBe(body);

	const replyBody = `${body}\nReply`;
	await inTx((tx) => reply(asAgent, tx, { thread: thread.id, body: replyBody }));
	const editedBody = `${body}\nEdit`;
	await inTx((tx) => edit(asHuman, tx, { id: thread.id, body: editedBody }));
	await inTx((tx) => resolve(asAgent, tx, { thread: thread.id, resolved: true }));
	await inTx((tx) => resolve(asHuman, tx, { thread: thread.id, resolved: false }));
	const [saved] = await inTx((tx) => list(asHuman, tx, { resource: doc.id }));
	expect(ResourceCommentThreadSchema.parse(saved).anchor).toEqual(longAnchor);
	expect(saved!.comments.map((comment) => comment.body)).toEqual([editedBody, replyBody]);
	expect(saved!.resolved).toBeNull();
	expect(saved!.textRemoved).toBe(false);
});

test("the database rejects empty text and invalid anchors after the text limits change", async () => {
	const doc = await newDoc();
	const thread = await inTx((tx) => create(asHuman, tx, { resource: doc.id, anchor, body: "Keep this." }));
	for (const change of [
		sql`body = ''`,
		sql`quote = ''`,
		sql`prefix = ${"x".repeat(33)}`,
		sql`suffix = ${"x".repeat(33)}`,
		sql`quote = NULL`,
	]) {
		await expect(
			inTx((tx) => tx.execute(sql`UPDATE resource_comments SET ${change} WHERE id = ${thread.id}`)),
		).rejects.toThrow();
	}
	expect((await inTx((tx) => list(asHuman, tx, { resource: doc.id })))[0]).toEqual(thread);
});
