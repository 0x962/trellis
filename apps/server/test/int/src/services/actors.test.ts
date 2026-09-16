import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { userInfo } from "node:os";
import { ActorSchema, DefaultActorSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import * as actors from "../../../../src/services/actors.ts";
import * as projects from "../../../../src/services/projects.ts";
import { claude, dana, seedActor, system } from "../../../fixtures";
import { at, type Harness, NOW, secondsAfter, serviceHarness } from "../../../helpers/services.ts";
import { countStatements } from "../../../helpers/statements.ts";

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

const upsert = (actor: typeof dana, now: Date = NOW) =>
	h.run((ctx, tx) => actors.upsert(ctx, tx, actor), { actor, now });

describe("actors.upsert", () => {
	test("an unseen actor is inserted with both timestamps", async () => {
		await upsert(dana);
		expect(await actorRows()).toEqual([
			{ name: "dana", kind: "human", first_seen_at: NOW.toISOString(), last_seen_at: NOW.toISOString() },
		]);
	});

	test("a second upsert inside 30 seconds writes nothing", async () => {
		await upsert(dana);
		const later = secondsAfter(10);
		const statements = await h.read((tx) =>
			countStatements(h.db.$client, () =>
				actors.upsert(
					h.ctx(() => {}, { now: later }),
					tx,
					dana,
				),
			),
		);
		expect(statements).toBe(0);
		expect((await actorRows())[0]!.last_seen_at).toBe(NOW.toISOString());
	});

	test("an upsert after 30 seconds flushes last_seen_at", async () => {
		await upsert(dana);
		const later = secondsAfter(31);
		await upsert(dana, later);
		expect(await actorRows()).toEqual([
			{ name: "dana", kind: "human", first_seen_at: NOW.toISOString(), last_seen_at: later.toISOString() },
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
		expect((await actorRows()).map((row) => `${row.kind}:${row.name}`)).toEqual(["agent:fresh", "system:trellis"]);
		const activity = await h.rows<{ actor_name: string; actor_kind: string }>(
			sql`SELECT actor_name, actor_kind FROM activity`,
		);
		expect(activity).toEqual([{ actor_name: "fresh", actor_kind: "agent" }]);
	});
});

describe("actors.list and actors.default", () => {
	test("list returns every actor newest seen first", async () => {
		await seedActor(h.db, dana);
		await seedActor(h.db, claude);
		await seedActor(h.db, system);
		await h.db.execute(sql`UPDATE actors SET last_seen_at = ${secondsAfter(-300)} WHERE name = 'dana'`);
		await h.db.execute(sql`UPDATE actors SET last_seen_at = ${secondsAfter(-10)} WHERE name = 'claude'`);
		await h.db.execute(sql`UPDATE actors SET last_seen_at = ${secondsAfter(-100)} WHERE name = 'trellis'`);
		const listed = await h.read((tx) =>
			actors.list(
				h.ctx(() => {}, { actor: null }),
				tx,
			),
		);
		expect(listed.map((actor) => actor.name)).toEqual(["claude", "trellis", "dana"]);
		for (const actor of listed) ActorSchema.parse(actor);
	});

	test("the default actor comes from the settings name", async () => {
		await h.db.execute(
			sql`INSERT INTO settings (key, value, updated_at) VALUES ('defaultActorName', ${JSON.stringify("dana")}::jsonb, ${NOW})`,
		);
		const result = await h.read((tx) =>
			actors.default(
				h.ctx(() => {}, { actor: null }),
				tx,
			),
		);
		expect(DefaultActorSchema.parse(result)).toEqual({ name: "dana", kind: "human", stored: true });
	});

	// A fresh browser adopts a stored name without the setup form. The
	// operating-system user name is only a suggestion, so it is not stored.
	test("the default actor is not stored until the settings hold a name", async () => {
		const result = await h.read((tx) =>
			actors.default(
				h.ctx(() => {}, { actor: null }),
				tx,
			),
		);
		expect(DefaultActorSchema.parse(result)).toEqual({ name: userInfo().username, kind: "human", stored: false });
	});
});
