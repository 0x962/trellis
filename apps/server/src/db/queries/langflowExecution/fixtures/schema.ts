import { getTableName } from "drizzle-orm";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";

const dialect = new PgDialect();
const names = (columns: { name: string }[]) => columns.map((column) => `"${column.name}"`).join(", ");
export function tableSql(table: PgTable) {
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
}
