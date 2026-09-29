import { afterAll, expect, test } from "bun:test";
import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { findActorId, resolveActorId } from "../../services/actorIdentity/index.ts";
import { upsert } from "../../services/actors.ts";
import { type Db, openDb } from "../client.ts";
import { iso } from "../queries/support.ts";
import { actorIdentityFixture } from "./components/databaseFixture/index.ts";

const databases: Db[] = [];

const openFixture = async () => {
	const fixture = await actorIdentityFixture();
	databases.push(fixture.db);
	return fixture;
};

const nameOf = (size: number, seed: number) => {
	let state = seed;
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,-./;<=>?@[]^_`{|}~";
	return Array.from({ length: size }, () => {
		state = (state * 48_271) % 2_147_483_647;
		return alphabet[state % alphabet.length]!;
	}).join("");
};

afterAll(async () => {
	await Promise.all(databases.map((db) => db.$client.close()));
});

test("resolves stable UUIDs for complete exact actor pairs", async () => {
	const { db, context } = await openFixture();
	const first = new Date("2026-09-29T20:00:00.000Z");
	const later = new Date("2026-09-29T20:01:00.000Z");
	const sharedPrefix = nameOf(4096, 17);
	const actors = [
		{ kind: "human", name: sharedPrefix },
		{ kind: "human", name: `${sharedPrefix}${nameOf(12_288, 29)}` },
		{ kind: "agent", name: sharedPrefix },
	] as const satisfies readonly ActorRef[];
	const ids = await db.transaction((tx) =>
		Promise.all(actors.map((actor) => resolveActorId(context(first), tx, actor))),
	);
	expect(ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(
		true,
	);
	expect(new Set(ids).size).toBe(actors.length);
	const repeated = await db.transaction((tx) => resolveActorId(context(later), tx, actors[0]));
	expect(repeated).toBe(ids[0]!);
	await db.transaction((tx) => upsert(context(later), tx, actors[0]));
	expect(
		(
			await db.execute(
				sql`SELECT name, kind, ${iso(sql`first_seen_at`)} AS first_seen_at,
					${iso(sql`last_seen_at`)} AS last_seen_at FROM actors ORDER BY kind, name`,
			)
		).rows,
	).toEqual([
		{ name: sharedPrefix, kind: "agent", first_seen_at: first.toISOString(), last_seen_at: first.toISOString() },
		{ name: sharedPrefix, kind: "human", first_seen_at: first.toISOString(), last_seen_at: later.toISOString() },
		{
			name: `${sharedPrefix}${nameOf(12_288, 29)}`,
			kind: "human",
			first_seen_at: first.toISOString(),
			last_seen_at: first.toISOString(),
		},
	]);
});

test("does not retain an actor identity after caller rollback", async () => {
	const { db, context } = await openFixture();
	const actor = { kind: "human", name: nameOf(4096, 41) } as const;
	const ctx = context(new Date("2026-09-29T20:02:00.000Z"));
	await expect(
		db.transaction(async (tx) => {
			await resolveActorId(ctx, tx, actor);
			throw new Error("roll back actor");
		}),
	).rejects.toThrow("roll back actor");
	expect(await db.transaction((tx) => findActorId(ctx, tx, actor))).toBeNull();
	expect(ctx.actorCache.size).toBe(0);
	const committed = await db.transaction((tx) => resolveActorId(ctx, tx, actor));
	expect(await db.transaction((tx) => findActorId(ctx, tx, actor))).toBe(committed);
});

test("returns one UUID for concurrent equal requests", async () => {
	const { db, context } = await openFixture();
	const actor = { kind: "agent", name: nameOf(16_384, 53) } as const;
	const at = new Date("2026-09-29T20:03:00.000Z");
	const ids = await Promise.all([
		db.transaction((tx) => resolveActorId(context(at), tx, actor)),
		db.transaction((tx) => resolveActorId(context(at), tx, actor)),
	]);
	expect(ids[0]).toBe(ids[1]);
	expect((await db.execute(sql`SELECT count(*)::int AS count FROM actors`)).rows).toEqual([{ count: 1 }]);
});

test("uses full equality when two actor pairs have the same hash", async () => {
	const { db, context } = await openFixture();
	const at = new Date("2026-09-29T20:03:30.000Z");
	const actors = [
		{ kind: "human", name: "15601" },
		{ kind: "human", name: "180514" },
	] as const satisfies readonly ActorRef[];
	expect(
		(
			await db.execute(
				sql`SELECT hash_array(ARRAY[${actors[0].kind}, ${actors[0].name}]) =
					hash_array(ARRAY[${actors[1].kind}, ${actors[1].name}]) AS equal`,
			)
		).rows,
	).toEqual([{ equal: true }]);
	const ids = await db.transaction((tx) => Promise.all(actors.map((actor) => resolveActorId(context(at), tx, actor))));
	expect(ids[0]).not.toBe(ids[1]);
	await expect(
		db.execute(
			sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
				VALUES (${actors[0].name}, ${actors[0].kind}, ${at}, ${at})`,
		),
	).rejects.toMatchObject({ code: "23P01", constraint: "actors_identity_equality" });
	const plan = await db.transaction(async (tx) => {
		await tx.execute(sql`SET LOCAL enable_seqscan=off`);
		return tx.execute(
			sql`EXPLAIN (COSTS OFF) SELECT id FROM actors
				WHERE ARRAY[kind, name]::text[] = ARRAY[${actors[0].kind}, ${actors[0].name}]::text[]`,
		);
	});
	expect(plan.rows).toContainEqual({ "QUERY PLAN": expect.stringContaining("actors_identity_equality") });
	expect(
		await db.transaction((tx) => Promise.all(actors.map((actor) => findActorId(context(new Date()), tx, actor)))),
	).toEqual(ids);
});

test("keeps actor UUIDs after an archive reopen", async () => {
	const { db, context } = await openFixture();
	const actor = { kind: "system", name: nameOf(4096, 67) } as const;
	const ctx = context(new Date("2026-09-29T20:04:00.000Z"));
	const id = await db.transaction((tx) => resolveActorId(ctx, tx, actor));
	const archive = await db.$client.dumpDataDir("none");
	await db.$client.close();
	databases.splice(databases.indexOf(db), 1);
	const restored = await openDb(":memory:", archive);
	databases.push(restored);
	expect(await restored.transaction((tx) => findActorId(ctx, tx, actor))).toBe(id);
});
