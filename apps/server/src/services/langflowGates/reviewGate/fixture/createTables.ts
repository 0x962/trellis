import { getTableName } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { langflowDocumentPublications, langflowDocumentRevisions } from "../../../../db/tables/langflowDocuments";
import {
	langflowClassifications,
	langflowExecutionProjections,
	langflowExecutions,
	langflowNativeHandles,
	langflowStops,
} from "../../../../db/tables/langflowExecution";
import type { testFixture } from "../../../flowExecutions/testFixture";

export async function createTables(db: Awaited<ReturnType<typeof testFixture>>["db"]) {
	const dialect = new PgDialect();
	const names = (columns: { name: string }[]) => columns.map((column) => `"${column.name}"`).join(", ");
	for (const table of [
		langflowDocumentRevisions,
		langflowDocumentPublications,
		langflowExecutions,
		langflowExecutionProjections,
		langflowClassifications,
		langflowNativeHandles,
		langflowStops,
	]) {
		const config = getTableConfig(table);
		const columns = config.columns.map(
			(column) =>
				`"${column.name}" ${column.getSQLType()}${column.notNull ? " NOT NULL" : ""}${column.primary ? " PRIMARY KEY" : ""}`,
		);
		const primary = config.primaryKeys.map((key) => `PRIMARY KEY (${names(key.columns)})`);
		const unique = config.uniqueConstraints.map(
			(key) => `CONSTRAINT "${key.getName()}" UNIQUE (${names(key.columns)})`,
		);
		const checks = config.checks.map(
			(check) => `CONSTRAINT "${check.name}" CHECK (${dialect.sqlToQuery(check.value).sql})`,
		);
		const foreign = config.foreignKeys.map((key) => {
			const ref = key.reference();
			return `CONSTRAINT "${key.getName()}" FOREIGN KEY (${names(ref.columns)}) REFERENCES "${getTableName(ref.foreignTable)}" (${names(ref.foreignColumns)}) ON DELETE ${key.onDelete}`;
		});
		await db.$client.exec(
			`CREATE TABLE "${config.name}" (${[...columns, ...primary, ...unique, ...checks, ...foreign].join(", ")})`,
		);
	}
}
