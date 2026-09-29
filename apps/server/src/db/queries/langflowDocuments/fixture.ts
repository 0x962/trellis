import { getTableName, sql } from "drizzle-orm";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { openDb } from "../../client.ts";
import {
	langflowDocumentConversions,
	langflowDocumentPublications,
	langflowDocumentPublicationStates,
	langflowDocumentRevisions,
	langflowDocumentSaveReceipts,
} from "../../tables/langflowDocuments/index.ts";
import { immutableDocumentRowsSql } from "../../tables/langflowDocuments/immutableRows.ts";

const dialect = new PgDialect();
const names = (columns: { name: string }[]) => columns.map((column) => `"${column.name}"`).join(", ");

// The fixture creates the declared tables in memory. The production migration
// and the restore path require their own tests after schema.ts adopts these tables.
const tableSql = (table: PgTable) => {
	const config = getTableConfig(table);
	const columns = config.columns.map(
		(column) =>
			`"${column.name}" ${column.getSQLType()}${column.notNull ? " NOT NULL" : ""}${column.primary ? " PRIMARY KEY" : ""}`,
	);
	const primary = config.primaryKeys.map((key) => `PRIMARY KEY (${names(key.columns)})`);
	const unique = config.uniqueConstraints.map((key) => `CONSTRAINT "${key.getName()}" UNIQUE (${names(key.columns)})`);
	const checks = config.checks.map(
		(check) => `CONSTRAINT "${check.name}" CHECK (${dialect.sqlToQuery(check.value).sql})`,
	);
	const foreign = config.foreignKeys.map((key) => {
		const ref = key.reference();
		return `CONSTRAINT "${key.getName()}" FOREIGN KEY (${names(ref.columns)}) REFERENCES "${getTableName(ref.foreignTable)}" (${names(ref.foreignColumns)}) ON DELETE ${key.onDelete}`;
	});
	return `CREATE TABLE "${config.name}" (${[...columns, ...primary, ...unique, ...checks, ...foreign].join(", ")})`;
};

export const documentFixture = async () => {
	const db = await openDb(":memory:");
	await db.$client.exec(`
		CREATE TABLE projects (id text PRIMARY KEY, key text NOT NULL);
		CREATE TABLE flows (
			id text PRIMARY KEY, project_id text REFERENCES projects(id) ON DELETE CASCADE,
			slug text NOT NULL, name text NOT NULL, description text NOT NULL, briefing text NOT NULL,
			harness jsonb, version integer NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
		);
	`);
	for (const table of [
		langflowDocumentRevisions,
		langflowDocumentPublications,
		langflowDocumentPublicationStates,
		langflowDocumentSaveReceipts,
		langflowDocumentConversions,
	]) {
		await db.$client.exec(tableSql(table));
	}
	await db.$client.exec(dialect.sqlToQuery(immutableDocumentRowsSql).sql);
	await db.execute(sql`INSERT INTO projects VALUES ('00000000000000000000000006', 'TRL')`);
	await db.execute(sql`INSERT INTO flows VALUES (
		'00000000000000000000000001', '00000000000000000000000006', 'review', 'Review',
		'Review a proposed change.', 'Read the ticket.', NULL, 1, '2026-09-29T06:00:00Z', '2026-09-29T06:00:00Z'
	)`);
	return db;
};
