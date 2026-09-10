import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ActorSchema, DefaultActorSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { claude, navid, seedActor, system } from "../../test/fixtures";
import { at, type Harness, NOW, secondsAfter, serviceHarness } from "../../test/helpers/services.ts";
import { countStatements } from "../../test/helpers/statements.ts";
import * as actors from "./actors.ts";
import * as projects from "./projects.ts";

// Every mutating service upserts its actor before its first write, so the
// actor foreign keys hold. The actor cache remembers the last write per
// actor and skips the statement for 30 s. `list` feeds the actor picker;
// `default` is the identity the web app starts with.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type ActorRow = { name: string; kind: string; first_seen_at: string; last_seen_at: string };

const actorRows = () =>
	h.rows<ActorRow>(
		sql`SELECT name, kind, ${at("first_seen_at")}, ${at("last_seen_at")} FROM actors ORDER BY name, kind`,
	);

const upsert = (actor: typeof navid, now: Date = NOW) =>
	h.run((ctx, tx) => actors.upsert(ctx, tx, actor), { actor, now });

describe("actors.upsert", () => {
	test("an unseen actor is inserted with both timestamps", async () => {
		await upsert(navid);
		expect(await actorRows()).toEqual([
			{ name: "navid", kind: "human", first_seen_at: NOW.toISOString(), last_seen_at: NOW.toISOString() },
		]);
	});

	test("a second upsert inside 30 seconds writes nothing", async () => {
		await upsert(navid);
		const later = secondsAfter(10);
		const statements = await h.read((tx) =>
			countStatements(h.db.$client, () =>
				actors.upsert(
					h.ctx(() => {}, { now: later }),
					tx,
					navid,
				),
			),
		);
		expect(statements).toBe(0);
		expect((await actorRows())[0]!.last_seen_at).toBe(NOW.toISOString());
	});

	test("an upsert after 30 seconds flushes last_seen_at", async () => {
		await upsert(navid);
		const later = secondsAfter(31);
		await upsert(navid, later);
		expect(await actorRows()).toEqual([
			{ name: "navid", kind: "human", first_seen_at: NOW.toISOString(), last_seen_at: later.toISOString() },
		]);
	});

	test("the actor cache is keyed by name and kind", async () => {
		await upsert({ name: "claude", kind: "human" });
		await upsert(claude);
		const rows = await actorRows();
		expect(rows.map((row) => `${row.kind}:${row.name}`)).toEqual(["agent:claude", "human:claude"]);
	});

	test("the system actor is stored with the system kind", async () => {
		await upsert(system);
		expect(await actorRows()).toEqual([
			{ name: "trellis", kind: "system", first_seen_at: NOW.toISOString(), last_seen_at: NOW.toISOString() },
		]);
	});

	test("a service upserts the actor before its first write", async () => {
		const unseen = { name: "fresh", kind: "agent" as const };
		await h.run((ctx, tx) => projects.create(ctx, tx, { key: "CDE", name: "Code" }), { actor: unseen });
		expect((await actorRows()).map((row) => `${row.kind}:${row.name}`)).toEqual(["agent:fresh"]);
		const activity = await h.rows<{ actor_name: string; actor_kind: string }>(
			sql`SELECT actor_name, actor_kind FROM activity`,
		);
		expect(activity).toEqual([{ actor_name: "fresh", actor_kind: "agent" }]);
	});
});

describe("actors.list and actors.default", () => {
	test("list returns every actor newest seen first", async () => {
		await seedActor(h.db, navid);
		await seedActor(h.db, claude);
		await seedActor(h.db, system);
		await h.db.execute(sql`UPDATE actors SET last_seen_at = ${secondsAfter(-300)} WHERE name = 'navid'`);
		await h.db.execute(sql`UPDATE actors SET last_seen_at = ${secondsAfter(-10)} WHERE name = 'claude'`);
		await h.db.execute(sql`UPDATE actors SET last_seen_at = ${secondsAfter(-100)} WHERE name = 'trellis'`);
		const listed = await h.read((tx) =>
			actors.list(
				h.ctx(() => {}, { actor: null }),
				tx,
			),
		);
		expect(listed.map((actor) => actor.name)).toEqual(["claude", "trellis", "navid"]);
		for (const actor of listed) ActorSchema.parse(actor);
	});

	test("the default actor comes from the settings name", async () => {
		await h.db.execute(
			sql`INSERT INTO settings (key, value, updated_at) VALUES ('defaultActorName', ${JSON.stringify("navid")}::jsonb, ${NOW})`,
		);
		const result = await h.read((tx) =>
			actors.default(
				h.ctx(() => {}, { actor: null }),
				tx,
			),
		);
		expect(DefaultActorSchema.parse(result)).toEqual({ name: "navid", kind: "human" });
	});
});
