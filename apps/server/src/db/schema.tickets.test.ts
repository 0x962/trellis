import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { insertRow, navid, seedComment, seedProject, seedRoot, seedStatuses, seedTicket } from "../../test/fixtures";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { checkNamed, FOREIGN_KEY, RESTRICT, UNIQUE } from "../../test/helpers/errors.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

describe("tickets", () => {
	test("tickets rejects a root_id that is not the project's root", async () => {
		const { rootId: r, statuses } = await seedProject(h.db, "RRR");
		const s = await seedRoot(h.db, "SSS");
		await expect(seedTicket(h.db, { projectId: r, rootId: s, statusId: statuses.todo })).rejects.toThrow(FOREIGN_KEY);
	});

	test("tickets rejects a parent from another root", async () => {
		const { rootId: r, statuses } = await seedProject(h.db, "RRR");
		const s = await seedRoot(h.db, "SSS");
		const sStatuses = await seedStatuses(h.db, s);
		const a = await seedTicket(h.db, { projectId: r, rootId: r, statusId: statuses.todo });
		const b = await seedTicket(h.db, { projectId: s, rootId: s, statusId: sStatuses.todo });
		await expect(seedTicket(h.db, { projectId: r, rootId: r, statusId: statuses.todo, parentId: b })).rejects.toThrow(
			FOREIGN_KEY,
		);
		await seedTicket(h.db, { projectId: r, rootId: r, statusId: statuses.todo, parentId: a });
	});

	test("tickets rejects parent_id = id", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const id = ulid();
		await expect(
			seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, parentId: id }, { id }),
		).rejects.toThrow(checkNamed("tickets_parent_not_self"));
	});

	test("tickets keeps number positive and unique per root", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 1 });
		await expect(seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 0 })).rejects.toThrow(
			checkNamed("tickets_number_check"),
		);
		await expect(seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 1 })).rejects.toThrow(
			UNIQUE,
		);
		const other = await seedRoot(h.db, "OPS");
		const otherStatuses = await seedStatuses(h.db, other);
		await seedTicket(h.db, { projectId: other, rootId: other, statusId: otherStatuses.todo, number: 1 });
	});

	test("tickets keeps title trimmed and between 1 and 500 characters", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		for (const title of ["", " padded", "padded ", "t".repeat(501)]) {
			await expect(seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title })).rejects.toThrow(
				checkNamed("tickets_title_check"),
			);
		}
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title: "t".repeat(500) });
	});

	test("tickets default priority, version, and description and reject an unknown priority", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const base = {
			project_id: rootId,
			root_id: rootId,
			status_id: statuses.todo,
			position: 1024,
			created_at: new Date(),
			updated_at: new Date(),
		};
		const row = await insertRow(h.db, "tickets", { ...base, id: ulid(), number: 1, title: "Defaults" });
		expect(row.priority).toBe("none");
		expect(row.version).toBe(1);
		expect(row.description).toBe("");
		await expect(
			insertRow(h.db, "tickets", { ...base, id: ulid(), number: 2, title: "Critical", priority: "critical" }),
		).rejects.toThrow(checkNamed("tickets_priority_check"));
	});

	// RESTRICT (confdeltype `r`) refuses the delete when it happens; NO ACTION
	// (`a`) waits for the end of the statement.
	test("the status, project, and parent foreign keys of tickets are RESTRICT", async () => {
		const result = await h.db.execute(sql`
			SELECT conname, confdeltype FROM pg_constraint
			WHERE conrelid = 'tickets'::regclass AND contype = 'f' ORDER BY conname
		`);
		expect(result.rows).toEqual([
			{ conname: "tickets_parent_fk", confdeltype: "r" },
			{ conname: "tickets_project_fk", confdeltype: "r" },
			{ conname: "tickets_status_id_statuses_id_fk", confdeltype: "r" },
		]);
	});

	test("tickets block the delete of their status", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
		await expect(h.db.execute(sql`DELETE FROM statuses WHERE id = ${statuses.todo}`)).rejects.toThrow(RESTRICT);
	});

	test("tickets block the delete of their project", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
		await expect(h.db.execute(sql`DELETE FROM projects WHERE id = ${rootId}`)).rejects.toThrow(RESTRICT);
	});

	test("tickets block the delete of their parent", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const parent = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, parentId: parent });
		await expect(h.db.execute(sql`DELETE FROM tickets WHERE id = ${parent}`)).rejects.toThrow(RESTRICT);
	});

	// ts_rank weighs an A-weight lexeme above a B-weight one, so a title hit
	// outranks a description hit.
	test("tickets.search is generated from title at weight A and description at weight B", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const t1 = await seedTicket(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.todo,
			title: "Authentication flow",
		});
		const t2 = await seedTicket(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.todo,
			title: "Other",
			description: "the authentication flow",
		});
		const result = await h.db.execute(sql`
			SELECT id FROM tickets
			WHERE search @@ to_tsquery('english', 'authent:*')
			ORDER BY ts_rank(search, to_tsquery('english', 'authent:*')) DESC
		`);
		expect(result.rows.map((row) => row.id)).toEqual([t1, t2]);
	});

	test("comments.search is generated from body at weight C", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const ticket = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
		const comment = await seedComment(h.db, ticket, "authentication broke", navid);
		const before = await h.db.execute(sql`SELECT search::text AS search FROM comments WHERE id = ${comment}`);
		expect(before.rows[0]?.search).toBe("'authent':1C 'broke':2C");
		await h.db.execute(sql`UPDATE comments SET body = 'billing fixed' WHERE id = ${comment}`);
		const after = await h.db.execute(sql`SELECT search::text AS search FROM comments WHERE id = ${comment}`);
		expect(after.rows[0]?.search).toBe("'bill':1C 'fix':2C");
	});
});
