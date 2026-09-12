import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { captureStatements } from "../../../helpers/statements.ts";

// GET /api/export streams every row as NDJSON: one header line, then one
// line per row with its table. The stream reads each table in keyset pages
// of 1000 rows and writes as it goes, so the first chunk leaves before the
// last row is read.

let h: TestDb;
let t: TestApp;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h });
});
afterAll(() => h.close());

type Line = { table?: string; row?: Record<string, unknown>; version?: unknown; exportedAt?: unknown };

const seedTickets = async (count: number) => {
	const project = await t.seedProject("CDE");
	const todo = project.statuses.find((status) => status.slug === "todo")!.id;
	await h.db.execute(sql`
		INSERT INTO tickets (id, project_id, root_id, number, title, description, priority, status_id, position, version, created_at, updated_at)
		SELECT lpad(g::text, 26, '0'), ${project.id}, ${project.id}, g, 'Ticket ' || g, '', 'none', ${todo}, g * 1024, 1, now(), now()
		FROM generate_series(1, ${count}) AS g
	`);
};

const request = () => t.app.request("http://trellis.test/api/export");

const lines = async (response: Response) =>
	(await response.text())
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line) as Line);

describe("export route", () => {
	test("the export route answers as an NDJSON attachment", async () => {
		await seedTickets(3);

		const response = await request();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("application/x-ndjson");
		expect(response.headers.get("content-disposition")).toMatch(/^attachment/);
		expect(response.headers.get("content-disposition")).toMatch(/\.ndjson/);
	});

	test("every export line is one JSON object with its table", async () => {
		await seedTickets(3);

		const parsed = await lines(await request());

		expect(parsed.length).toBeGreaterThan(3);
		expect(parsed[0]!.version).toBeDefined();
		expect(Date.parse(String(parsed[0]!.exportedAt))).toBeGreaterThan(0);
		expect(parsed[0]!.table).toBeUndefined();
		for (const line of parsed.slice(1)) {
			expect(typeof line.table).toBe("string");
			expect(line.row).toBeObject();
		}
		expect(parsed.filter((line) => line.table === "tickets")).toHaveLength(3);
	});

	test("the export pages through a table without repeating a row", async () => {
		await seedTickets(2500);
		const capture = captureStatements(h.db.$client);

		const parsed = await lines(await request()).finally(capture.restore);

		const ids = parsed.filter((line) => line.table === "tickets").map((line) => String(line.row!.id));
		expect(ids).toHaveLength(2500);
		expect(new Set(ids).size).toBe(2500);
		const reads = capture.texts.filter((text) => /from\s+"?tickets"?/i.test(text));
		expect(reads).toHaveLength(3);
	});

	test("the export streams instead of buffering the whole body", async () => {
		await seedTickets(2500);
		const capture = captureStatements(h.db.$client);

		const response = await request();
		const reader = response.body!.getReader();
		const first = await reader.read();
		const statementsAtFirstChunk = capture.texts.length;
		let rest = "";
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) break;
			rest += new TextDecoder().decode(chunk.value);
		}
		capture.restore();

		expect(first.done).toBe(false);
		expect(first.value!.length).toBeGreaterThan(0);
		expect(capture.texts.length).toBeGreaterThan(statementsAtFirstChunk);
		expect(rest.trimEnd().split("\n").length).toBeGreaterThan(2000);
	});
});
