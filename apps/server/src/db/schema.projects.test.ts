import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { seedChild, seedRoot } from "../../test/fixtures";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { checkNamed, FOREIGN_KEY, UNIQUE } from "../../test/helpers/errors.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

describe("projects", () => {
	test("projects rejects a key outside ^[A-Z][A-Z0-9]{1,9}$", async () => {
		await expect(seedRoot(h.db, "cde")).rejects.toThrow(checkNamed("projects_key_check"));
		await seedRoot(h.db, "CDE");
		await seedRoot(h.db, "A1");
		await seedRoot(h.db, "ABCDEFGHIJ");
	});

	test("projects rejects a root without a key", async () => {
		await expect(seedRoot(h.db, "X", { key: null, slug: "nokey" })).rejects.toThrow(
			checkNamed("projects_root_has_key"),
		);
	});

	test("projects rejects a sub-project with a key", async () => {
		const root = await seedRoot(h.db, "CDE");
		await expect(seedChild(h.db, root, root, "web", { key: "WEB" })).rejects.toThrow(
			checkNamed("projects_root_has_key"),
		);
	});

	test("projects rejects parent_id = id", async () => {
		const root = await seedRoot(h.db, "CDE");
		const id = ulid();
		await expect(seedChild(h.db, id, root, "loop", { id })).rejects.toThrow(checkNamed("projects_parent_not_self"));
	});

	test("projects ties root_id = id to a null parent", async () => {
		const root = await seedRoot(h.db, "CDE");
		await expect(seedRoot(h.db, "OPS", { root_id: root })).rejects.toThrow(checkNamed("projects_root_is_self"));
		const id = ulid();
		await expect(seedChild(h.db, root, id, "web", { id })).rejects.toThrow(checkNamed("projects_root_is_self"));
	});

	test("projects keeps the ticket counter on roots only", async () => {
		const root = await seedRoot(h.db, "CDE");
		await expect(seedChild(h.db, root, root, "web", { ticket_counter: 1 })).rejects.toThrow(
			checkNamed("projects_counter_on_root"),
		);
		await seedRoot(h.db, "OPS", { ticket_counter: 5 });
	});

	test("projects rejects a slug outside the grammar or named board or settings", async () => {
		const root = await seedRoot(h.db, "CDE");
		for (const slug of ["board", "settings", "Web", "a--b", "-a", ""]) {
			await expect(seedChild(h.db, root, root, slug)).rejects.toThrow(checkNamed("projects_slug_check"));
		}
		for (const slug of ["web", "web-auth", "v2"]) {
			await seedChild(h.db, root, root, slug);
		}
	});

	test("projects rejects a duplicate key", async () => {
		await seedRoot(h.db, "CDE");
		await expect(seedRoot(h.db, "CDE", { slug: "cde-two" })).rejects.toThrow(UNIQUE);
	});

	test("projects rejects a duplicate slug among siblings and among roots", async () => {
		const root = await seedRoot(h.db, "CDE");
		await seedChild(h.db, root, root, "web");
		await expect(seedRoot(h.db, "OPS", { slug: "cde" })).rejects.toThrow(UNIQUE);
		await expect(seedChild(h.db, root, root, "web")).rejects.toThrow(UNIQUE);
		const other = await seedRoot(h.db, "OPS");
		await seedChild(h.db, other, other, "web");
	});

	test("projects rejects a child whose root_id differs from its parent's root", async () => {
		const a = await seedRoot(h.db, "AAA");
		const b = await seedRoot(h.db, "BBB");
		await expect(seedChild(h.db, a, b, "web")).rejects.toThrow(FOREIGN_KEY);
	});

	test("projects refuses to delete a parent that still has children", async () => {
		const root = await seedRoot(h.db, "CDE");
		const child = await seedChild(h.db, root, root, "web");
		await expect(h.db.execute(sql`DELETE FROM projects WHERE id = ${root}`)).rejects.toThrow(FOREIGN_KEY);
		await h.db.execute(sql`DELETE FROM projects WHERE id = ${child}`);
		await h.db.execute(sql`DELETE FROM projects WHERE id = ${root}`);
		const left = await h.db.execute(sql`SELECT count(*)::int AS n FROM projects`);
		expect(left.rows[0]?.n).toBe(0);
	});

	test("projects keeps name between 1 and 120 characters", async () => {
		await expect(seedRoot(h.db, "CDE", { name: "" })).rejects.toThrow(checkNamed("projects_name_check"));
		await expect(seedRoot(h.db, "CDE", { name: "n".repeat(121) })).rejects.toThrow(checkNamed("projects_name_check"));
		await seedRoot(h.db, "CDE", { name: "n".repeat(120) });
	});
});
