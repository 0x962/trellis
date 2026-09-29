import { tableSql } from "../../../../../db/queries/langflowExecution/fixtures/schema.ts";
import { langflowDocumentPublications, langflowDocumentRevisions } from "../../../../../db/tables/langflowDocuments";
import {
	langflowClassifications,
	langflowExecutionProjections,
	langflowExecutions,
	langflowNativeHandles,
	langflowOutbox,
	langflowStartReceipts,
	langflowStops,
} from "../../../../../db/tables/langflowExecution";
import type { testFixture } from "../../../../flowExecutions/testFixture";

export async function createTables(db: Awaited<ReturnType<typeof testFixture>>["db"]) {
	for (const table of [
		langflowDocumentRevisions,
		langflowDocumentPublications,
		langflowExecutions,
		langflowStartReceipts,
		langflowOutbox,
		langflowExecutionProjections,
		langflowClassifications,
		langflowNativeHandles,
		langflowStops,
	]) {
		await db.$client.exec(tableSql(table));
	}
}
