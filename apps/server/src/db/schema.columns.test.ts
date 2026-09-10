import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
afterAll(() => h.close());

type Column = {
	table_name: string;
	column_name: string;
	data_type: string;
	is_generated: string;
	generation_expression: string | null;
	identity_generation: string | null;
	column_default: string | null;
};

const columns = async () => {
	const result = await h.db.execute(sql`
		SELECT table_name, column_name, data_type, is_generated, generation_expression,
			identity_generation, column_default
		FROM information_schema.columns WHERE table_schema = 'public'
	`);
	return result.rows as Column[];
};

const column = (rows: Column[], table: string, name: string) =>
	rows.find((row) => row.table_name === table && row.column_name === name)!;

// Every index definition of one table, with whitespace collapsed and the
// identifier quotes removed, so `"position"` and `position` read the same.
const indexDefinitions = async (table: string) => {
	const result = await h.db.execute(sql`SELECT indexdef FROM pg_indexes WHERE tablename = ${table}`);
	return result.rows.map((row) => (row.indexdef as string).replaceAll('"', "").replace(/\s+/g, " "));
};

const expectIndex = (definitions: string[], pattern: RegExp) => {
	expect(definitions.some((definition) => pattern.test(definition))).toBe(true);
};

describe("column types", () => {
	test("column types follow the schema table", async () => {
		const rows = await columns();
		// activity and agent_pings sort and page by a rising identity id; every
		// other table keys on a ULID.
		for (const row of rows.filter((row) => row.column_name === "id")) {
			if (row.table_name === "activity" || row.table_name === "agent_pings") continue;
			expect(`${row.table_name}.id ${row.data_type}`).toBe(`${row.table_name}.id text`);
		}
		for (const table of ["activity", "agent_pings"]) {
			const identity = column(rows, table, "id");
			expect(`${table} ${identity.data_type}`).toBe(`${table} bigint`);
			expect(`${table} ${identity.identity_generation}`).toBe(`${table} ALWAYS`);
		}
		for (const row of rows.filter((row) => row.column_name.endsWith("_at"))) {
			expect(`${row.table_name}.${row.column_name} ${row.data_type}`).toBe(
				`${row.table_name}.${row.column_name} timestamp with time zone`,
			);
		}
		for (const table of ["tickets", "comments"]) {
			const search = column(rows, table, "search");
			expect(search.data_type).toBe("tsvector");
			expect(search.is_generated).toBe("ALWAYS");
			expect(search.generation_expression).toContain("to_tsvector");
		}
		expect(column(rows, "activity", "meta").column_default).toBe("'{}'::jsonb");
	});
});

describe("indexes", () => {
	test("every index from the schema table exists", async () => {
		const projects = await indexDefinitions("projects");
		expectIndex(projects, /USING btree \(root_id\)/);

		const tickets = await indexDefinitions("tickets");
		expectIndex(tickets, /USING btree \(project_id, status_id, position\)/);
		expectIndex(tickets, /USING btree \(parent_id\)/);
		expectIndex(tickets, /USING btree \(root_id, updated_at DESC\) WHERE \(completed_at IS NULL\)/);
		expectIndex(tickets, /USING btree \(root_id, completed_at DESC\) WHERE \(completed_at IS NOT NULL\)/);
		expectIndex(tickets, /USING gin \(search\)/);
		expectIndex(tickets, /USING gin \(title gin_trgm_ops\)/);

		const comments = await indexDefinitions("comments");
		expectIndex(comments, /USING btree \(ticket_id, created_at\)/);
		expectIndex(comments, /USING gin \(search\)/);

		const attachments = await indexDefinitions("attachments");
		expectIndex(attachments, /USING btree \(ticket_id\)/);
		expectIndex(attachments, /USING btree \(sha256\)/);

		expectIndex(await indexDefinitions("pull_requests"), /USING btree \(state, ci_state\)/);
		expectIndex(await indexDefinitions("ticket_pull_requests"), /USING btree \(pull_request_id\)/);

		const activity = await indexDefinitions("activity");
		expectIndex(activity, /USING btree \(ticket_id, id\)/);
		expectIndex(activity, /USING btree \(root_id, id\)/);
		expectIndex(activity, /USING btree \(project_id, id\)/);
		expectIndex(activity, /USING btree \(created_at\)/);

		expectIndex(
			await indexDefinitions("statuses"),
			/CREATE UNIQUE INDEX .* USING btree \(project_id\) WHERE is_default/,
		);
	});
});
