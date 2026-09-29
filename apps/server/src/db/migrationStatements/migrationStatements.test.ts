import { afterEach, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { type Db, openDb } from "../client";
import { migrate } from "../migrate";

let db: Db;
afterEach(async () => db.$client.close());

test("applies the complete journal and reopens without rewriting historical migration hashes", async () => {
	const journal = JSON.parse(await readFile(join(import.meta.dir, "../../../drizzle/meta/_journal.json"), "utf8")) as {
		entries: { idx: number; when: number }[];
	};
	db = await openDb(":memory:");
	expect(await migrate(db)).toBe(journal.entries.length);
	const triggers = await db.execute(sql`
		SELECT tgname FROM pg_trigger
		WHERE tgname IN ('retain_langflow_owner_fence', 'retain_langflow_authority_commit', 'langflow_document_action_immutable')
		ORDER BY tgname
	`);
	expect(triggers.rows).toEqual([
		{ tgname: "langflow_document_action_immutable" },
		{ tgname: "retain_langflow_authority_commit" },
		{ tgname: "retain_langflow_owner_fence" },
	]);
	const ownerId = crypto.randomUUID();
	await db.execute(sql`INSERT INTO langflow_owner_fences (id, owner_key, revocation)
		VALUES (${ownerId}, ARRAY['host', 'owner'], '{"id":"revoked"}'::jsonb)`);
	await expect(
		db.execute(sql`UPDATE langflow_owner_fences SET revocation = NULL WHERE id = ${ownerId}`),
	).rejects.toThrow("Owner revocations are immutable");
	await expect(
		db.execute(sql`INSERT INTO langflow_owner_fences (id, owner_key)
		VALUES (${crypto.randomUUID()}, ARRAY['host', 'owner'])`),
	).rejects.toThrow();
	const hashes = [
		{ idx: 140, hash: "38111cd1c936c5927e55d5aed9ad03719cb058eea0a21c56e1f1bdf5d1f6b5ee" },
		{ idx: 142, hash: "755ebb99eb2e00cc0744ea780d9c9992f7ce225f548a393f0822a7197f869d47" },
	];
	for (const entry of hashes) {
		const timestamp = journal.entries.find((item) => item.idx === entry.idx)!.when;
		await db.execute(sql`UPDATE drizzle.__drizzle_migrations SET hash = ${entry.hash} WHERE created_at = ${timestamp}`);
	}
	const before = (await db.execute(sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`))
		.rows;
	const archive = await db.$client.dumpDataDir();
	await db.$client.close();
	db = await openDb(":memory:", archive);
	expect(await migrate(db)).toBe(0);
	expect(
		(await db.execute(sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`)).rows,
	).toEqual(before);
	expect((await db.execute(sql`SELECT revocation FROM langflow_owner_fences WHERE id = ${ownerId}`)).rows).toEqual([
		{ revocation: { id: "revoked" } },
	]);
}, 60000);
