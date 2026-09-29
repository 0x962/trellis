import { afterAll, beforeAll, expect, test } from "bun:test";
import { type SQL, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { touchActor } from "../../services/support.ts";
import { rows } from "../queries/support.ts";
import { openTestDb, openTestDbFromArchive } from "../testDb.ts";
import { actorRelationshipMapping } from "./mapping.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const at = new Date("2026-09-29T20:00:00Z");
const projectId = ulid();
const shortName = "migration-actor";

const longName = (() => {
	const alphabet = "!#$%&'()*+,-./0123456789;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
	let state = 0x952739;
	return Array.from({ length: 4096 }, () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return alphabet[state % alphabet.length];
	}).join("");
})();

const readRows = <T>(database: Awaited<ReturnType<typeof openTestDb>>, query: SQL) =>
	database.transaction((tx) => rows<T>(tx, query));

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES (${shortName}, 'agent', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'REL', 'relationships', 'Relationships', ${at}, ${at})`);
	const shortActorId = (
		await readRows<{ id: string }>(
			db,
			sql`SELECT id FROM actors
				WHERE ARRAY[kind, name]::text[] = ARRAY['agent', ${shortName}]::text[]`,
		)
	)[0]!.id;
	await db.execute(sql`INSERT INTO activity
		(batch_id, project_id, actor_id, actor_name, actor_kind, action, meta, created_at)
		VALUES (${ulid()}, ${projectId}, ${shortActorId}, ${shortName}, 'agent', 'seeded', '{}'::jsonb, ${at})`);
}, 60_000);

afterAll(async () => {
	await db.$client.close();
});

test("maps all actor relationship roles", () => {
	expect(actorRelationshipMapping).toHaveLength(22);
	expect(new Set(actorRelationshipMapping.map((role) => role.table))).toHaveLength(18);
});

test("preserves exact bindings and rejects mismatches", async () => {
	const beforeCount = (await readRows<{ count: number }>(db, sql`SELECT count(*)::int AS count FROM activity`))[0]!
		.count;
	const shortActorId = (
		await readRows<{ id: string }>(db, sql`SELECT id FROM actors WHERE name = ${shortName} AND kind = 'agent'`)
	)[0]!.id;
	const backfilled = (
		await readRows<{ actor_id: string; actor_name: string; actor_kind: string }>(
			db,
			sql`SELECT actor_id, actor_name, actor_kind FROM activity WHERE action = 'seeded'`,
		)
	)[0]!;
	expect(beforeCount).toBe(1);
	expect(backfilled).toEqual({ actor_id: shortActorId, actor_name: shortName, actor_kind: "agent" });

	const longActorId = (
		await readRows<{ id: string }>(
			db,
			sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
			VALUES (${longName}, 'agent', ${at}, ${at}) RETURNING id`,
		)
	)[0]!.id;
	await db.execute(sql`SET enable_seqscan = off`);
	const lookupPlan = await db.execute(sql`EXPLAIN SELECT id FROM actors
		WHERE ARRAY[kind, name]::text[] = ARRAY['agent', ${longName}]::text[]`);
	expect(JSON.stringify(lookupPlan.rows)).toContain("actors_identity_equality");
	await db.execute(sql`SET enable_seqscan = on`);
	const touchedId = await db.transaction((tx) =>
		touchActor(tx, { name: longName, kind: "agent" }, new Date(at.getTime() + 2)),
	);
	expect(touchedId).toBe(longActorId);
	const validBatch = ulid();
	await db.execute(sql`INSERT INTO activity
		(batch_id, project_id, actor_id, actor_name, actor_kind, action, meta, created_at)
		VALUES (${validBatch}, ${projectId}, ${longActorId}, ${longName}, 'agent', 'valid', '{}'::jsonb, ${at})`);
	await expect(
		db.execute(sql`INSERT INTO activity
			(batch_id, project_id, actor_id, actor_name, actor_kind, action, meta, created_at)
			VALUES (${ulid()}, ${projectId}, ${shortActorId}, ${longName}, 'agent', 'mismatch', '{}'::jsonb, ${at})`),
	).rejects.toThrow("An actor binding must match one actors row.");
	await expect(
		db.execute(sql`UPDATE activity SET actor_name = ${shortName} WHERE batch_id = ${validBatch}`),
	).rejects.toThrow("An actor binding must match one actors row.");

	await expect(db.execute(sql`UPDATE actors SET id = gen_random_uuid() WHERE id = ${longActorId}`)).rejects.toThrow(
		"Actor identity fields are immutable.",
	);
	await expect(db.execute(sql`UPDATE actors SET name = 'changed' WHERE id = ${longActorId}`)).rejects.toThrow(
		"Actor identity fields are immutable.",
	);
	await expect(db.execute(sql`UPDATE actors SET kind = 'human' WHERE id = ${longActorId}`)).rejects.toThrow(
		"Actor identity fields are immutable.",
	);
	await db.execute(sql`UPDATE actors SET last_seen_at = ${new Date(at.getTime() + 1)} WHERE id = ${longActorId}`);
	await expect(db.execute(sql`DELETE FROM actors WHERE id = ${longActorId}`)).rejects.toThrow();

	const rollbackBatch = ulid();
	await expect(
		db.transaction(async (tx) => {
			await tx.execute(sql`INSERT INTO activity
				(batch_id, project_id, actor_id, actor_name, actor_kind, action, meta, created_at)
				VALUES (${rollbackBatch}, ${projectId}, ${longActorId}, ${longName}, 'agent', 'rollback', '{}'::jsonb, ${at})`);
			await tx.execute(sql`UPDATE activity SET actor_name = ${shortName} WHERE batch_id = ${rollbackBatch}`);
		}),
	).rejects.toThrow("An actor binding must match one actors row.");
	const rolledBack = (
		await readRows<{ count: number }>(
			db,
			sql`SELECT count(*)::int AS count FROM activity WHERE batch_id = ${rollbackBatch}`,
		)
	)[0]!.count;
	expect(rolledBack).toBe(0);

	const pageId = ulid();
	await db.execute(sql`INSERT INTO pages
		(id, project_id, slug, title, creator_actor_id, creator_actor_name, creator_actor_kind,
			actor_id, actor_name, actor_kind, created_at, updated_at)
		VALUES (${pageId}, ${projectId}, ${pageId.toLowerCase()}, 'Page', ${longActorId}, ${longName}, 'agent',
			${longActorId}, ${longName}, 'agent', ${at}, ${at})`);
	await expect(
		db.execute(sql`UPDATE pages SET deleted_at = ${at}, deleted_actor_id = ${shortActorId} WHERE id = ${pageId}`),
	).rejects.toThrow();
	await db.execute(sql`UPDATE pages SET deleted_at = ${at}, deleted_actor_id = ${shortActorId},
		deleted_actor_name = ${shortName}, deleted_actor_kind = 'agent' WHERE id = ${pageId}`);
	await expect(db.execute(sql`UPDATE pages SET deleted_actor_name = ${longName} WHERE id = ${pageId}`)).rejects.toThrow(
		"An actor binding must match one actors row.",
	);
	await db.execute(sql`UPDATE pages SET deleted_at = NULL, deleted_actor_id = NULL,
		deleted_actor_name = NULL, deleted_actor_kind = NULL WHERE id = ${pageId}`);

	await db.execute(sql`INSERT INTO page_versions
		(page_id, number, request_id, document_sha256, document_size, source_path,
			actor_id, actor_name, actor_kind, created_at)
		VALUES (${pageId}, 1, ${crypto.randomUUID()}, ${"a".repeat(64)}, 1, 'index.html',
			${longActorId}, ${longName}, 'agent', ${at})`);
	const threadId = ulid();
	await db.execute(sql`INSERT INTO page_comment_threads
		(id, page_id, version, anchor_kind, anchor, actor_id, actor_name, actor_kind, created_at, updated_at)
		VALUES (${threadId}, ${pageId}, 1, 'element', '{"kind":"element","path":"html"}'::jsonb,
			${longActorId}, ${longName}, 'agent', ${at}, ${at})`);
	await db.execute(sql`UPDATE page_comment_threads SET resolved_at = ${at}, resolved_by_id = ${shortActorId},
		resolved_by_name = ${shortName}, resolved_by_kind = 'agent' WHERE id = ${threadId}`);
	await expect(
		db.execute(sql`UPDATE page_comment_threads SET resolved_by_name = ${longName} WHERE id = ${threadId}`),
	).rejects.toThrow("An actor binding must match one actors row.");

	const epicId = ulid();
	await db.execute(sql`INSERT INTO epics
		(id, project_id, slug, name, actor_id, actor_name, actor_kind, created_at, updated_at)
		VALUES (${epicId}, ${projectId}, ${epicId.toLowerCase()}, 'Epic', ${longActorId}, ${longName}, 'agent', ${at}, ${at})`);
	const resourceId = ulid();
	await db.execute(sql`INSERT INTO epic_resources
		(id, epic_id, kind, name, body, actor_id, actor_name, actor_kind, created_at, updated_at)
		VALUES (${resourceId}, ${epicId}, 'doc', 'Document', 'Body', ${longActorId}, ${longName}, 'agent', ${at}, ${at})`);
	const resourceCommentId = ulid();
	await db.execute(sql`INSERT INTO resource_comments
		(id, resource_id, thread_id, body, quote, prefix, suffix, actor_id, actor_name, actor_kind, created_at, updated_at)
		VALUES (${resourceCommentId}, ${resourceId}, ${resourceCommentId}, 'Comment', 'Body', '', '',
			${longActorId}, ${longName}, 'agent', ${at}, ${at})`);
	await db.execute(sql`UPDATE resource_comments SET resolved_at = ${at}, resolved_by_id = ${shortActorId},
		resolved_by_name = ${shortName}, resolved_by_kind = 'agent' WHERE id = ${resourceCommentId}`);
	await expect(
		db.execute(sql`UPDATE resource_comments SET resolved_by_id = ${longActorId} WHERE id = ${resourceCommentId}`),
	).rejects.toThrow("An actor binding must match one actors row.");

	const archive = await db.$client.dumpDataDir("none");
	const reopened = await openTestDbFromArchive(archive);
	const reopenedActivity = (
		await readRows<{ actor_id: string; actor_name: string }>(
			reopened,
			sql`SELECT actor_id, actor_name FROM activity WHERE batch_id = ${validBatch}`,
		)
	)[0]!;
	expect(reopenedActivity).toEqual({ actor_id: longActorId, actor_name: longName });
	await reopened.$client.close();
}, 60_000);
