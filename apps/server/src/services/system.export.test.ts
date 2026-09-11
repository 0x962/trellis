import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import {
	insertRow,
	linkPr,
	navid,
	seedActivity,
	seedAttachment,
	seedComment,
	seedPr,
	seedProject,
	seedTicket,
} from "../../test/fixtures";
import { testCtx } from "../../test/helpers/ctx.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { freshHomeWithDirs } from "../../test/helpers/home.ts";
import { captureStatements } from "../../test/helpers/statements.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import { exportNdjson } from "./system.ts";

// The export streams NDJSON: one header line, then one line per row tagged
// with its table. Each table is read in keyset pages of 1000 rows, so the
// stream holds no more than one page in memory.

let h: TestDb;
let home: string;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	home = freshHomeWithDirs();
});
afterEach(() => h.db.transaction(assertStatusInvariant));
afterAll(() => h.close());

type Line = { table?: string; row?: Record<string, unknown>; version?: unknown; exportedAt?: unknown };

const collect = async () => {
	const ctx = testCtx({ db: h.db, home }).ctx;
	const lines: Line[] = [];
	await h.db.transaction(async (tx) => {
		for await (const line of exportNdjson(ctx, tx, {})) lines.push(JSON.parse(line) as Line);
	});
	return lines;
};

const seedEveryTable = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const ticket = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 1 });
	await insertRow(h.db, "repos", { id: ulid(), project_id: rootId, owner: "acme", repo: "web" });
	await seedComment(h.db, ticket, "a comment");
	await seedAttachment(h.db, ticket);
	const pr = await seedPr(h.db, { number: 12 });
	await linkPr(h.db, ticket, pr, navid);
	await seedActivity(h.db, { rootId, projectId: rootId, ticketId: ticket });
	await insertRow(h.db, "settings", { key: "actor.default", value: { name: "navid" }, updated_at: new Date() });
	await insertRow(h.db, "personas", {
		id: ulid(),
		name: "Reviewer",
		instruction: "Read the diff.\nReport defects with evidence.",
		created_at: new Date(),
		updated_at: new Date(),
	});
	return { rootId, ticket };
};

describe("system.exportNdjson", () => {
	test("the export starts with a header line and then one line per row", async () => {
		await seedEveryTable();

		const lines = await collect();

		expect(lines[0]!.version).toBeDefined();
		expect(Date.parse(String(lines[0]!.exportedAt))).toBeGreaterThan(0);
		expect(lines[0]!.table).toBeUndefined();
		for (const line of lines.slice(1)) {
			expect(typeof line.table).toBe("string");
			expect(line.row).toBeObject();
		}
		const tickets = lines.filter((line) => line.table === "tickets");
		expect(tickets).toHaveLength(1);
	});

	test("the export pages a table in 1000 row keyset pages", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await h.db.execute(sql`
			INSERT INTO tickets (id, project_id, root_id, number, title, description, priority, status_id, position, version, created_at, updated_at)
			SELECT lpad(g::text, 26, '0'), ${rootId}, ${rootId}, g, 'Ticket ' || g, '', 'none', ${statuses.todo}, g * 1024, 1, now(), now()
			FROM generate_series(1, 2500) AS g
		`);
		const capture = captureStatements(h.db.$client);

		const lines = await collect().finally(capture.restore);

		const reads = capture.texts.filter((text) => /from\s+"?tickets"?/i.test(text));
		expect(reads).toHaveLength(3);
		const ids = lines.filter((line) => line.table === "tickets").map((line) => String(line.row!.id));
		expect(ids).toHaveLength(2500);
		expect(new Set(ids).size).toBe(2500);
		expect(ids).toEqual([...ids].sort());
	});

	test("the export covers every table in the schema", async () => {
		await seedEveryTable();

		const lines = await collect();

		const listed = await h.db.execute(sql`
			SELECT table_name FROM information_schema.tables
			WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
			ORDER BY table_name
		`);
		const tables = listed.rows.map((row) => row.table_name as string);
		const streamed = new Set(lines.slice(1).map((line) => line.table));
		expect(tables.length).toBeGreaterThan(0);
		for (const table of tables) expect(streamed).toContain(table);
		const personas = lines.filter((line) => line.table === "personas");
		expect(personas).toHaveLength(1);
		expect(personas[0]!.row).toMatchObject({
			name: "Reviewer",
			instruction: "Read the diff.\nReport defects with evidence.",
		});
	});

	test("the export carries the ticket identifier and the attachment url", async () => {
		const { ticket } = await seedEveryTable();

		const lines = await collect();

		const ticketLine = lines.find((line) => line.table === "tickets")!;
		expect(ticketLine.row).toMatchObject({ id: ticket, identifier: "CDE-1" });
		const attachmentLine = lines.find((line) => line.table === "attachments")!;
		expect(attachmentLine.row!.url).toBe(`/api/attachments/${attachmentLine.row!.id}/file`);
	});
});
