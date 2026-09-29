import { getTableColumns, getTableName, is, type SQL, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { protocolDigest } from "../../../../langflowContracts";
import * as documents from "../../../tables/langflowDocuments";
import * as executions from "../../../tables/langflowExecution";
import type { Tx } from "../../../tx";
import { canonicalJson, compareUtf8 } from "./canonicalJson";
import { readReconciliationMigrations } from "./readReconciliationMigrations";
import type { ReconciliationFacts } from "./schema";

function rowQuery(table: PgTable): SQL {
	const fields = Object.values(getTableColumns(table)).flatMap((column) => {
		const type = column.getSQLType();
		let value: SQL = sql`${column}`;
		if (type === "bytea") value = sql`encode(${column}, 'hex')`;
		if (type.startsWith("timestamp")) {
			value = sql`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
		}
		return [sql`${column.name}::text`, value];
	});
	return sql`SELECT jsonb_build_object(${sql.join(fields, sql`, `)})::text AS row_bytes FROM ${table}`;
}

export async function readReconciliationFacts(tx: Tx): Promise<ReconciliationFacts> {
	const migrations = await readReconciliationMigrations(tx);
	const queries = Object.values<unknown>({ ...documents, ...executions })
		.filter((value): value is PgTable => is(value, PgTable))
		.map((table) => ({ name: getTableName(table), query: rowQuery(table) }));
	queries.push({
		name: "retained_native_associations",
		query: sql`SELECT jsonb_build_object(
			'execution_id', h.execution_id, 'step_id', h.step_id, 'attempt_id', h.attempt_id,
			'agent_run_id', h.agent_run_id,
			'agent_run', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
				'id', r.id, 'terminal_id', r.terminal_id, 'session_id', r.session_id,
				'workspace_id', r.workspace_id, 'session_lost', r.session_lost) END,
			'session', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
				'id', s.id, 'run_id', s.run_id, 'directory', s.directory) END
		)::text AS row_bytes
		FROM langflow_native_handles h
		LEFT JOIN agent_runs r ON r.id = h.agent_run_id
		LEFT JOIN sessions s ON s.run_id = h.agent_run_id`,
	});
	queries.sort((left, right) => compareUtf8(left.name, right.name));
	const tables: string[] = [];
	for (const { name, query } of queries) {
		const result = await tx.execute<{ row_bytes: string }>(query);
		const rows = result.rows.map((row) => canonicalJson(row.row_bytes)).sort(compareUtf8);
		tables.push(`{"name":${JSON.stringify(name)},"rows":[${rows.join(",")}]}`);
	}
	const sourceBytes = `{"tables":[${tables.join(",")}],"version":1}`;
	return { migrations, facts: { sourceBytes, sourceDigest: protocolDigest(sourceBytes) } };
}
