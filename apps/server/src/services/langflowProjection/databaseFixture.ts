import { flowV1FixtureIds, flowV1RequestId } from "@trellis/api";
import { getTableName } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { documentFixture } from "../../db/queries/langflowDocuments/fixture.ts";
import * as tables from "../../db/tables/langflowExecution";
import { type Tx, withTx } from "../../db/tx.ts";
import type { DeliveryAuthorityV1 } from "../../langflowContracts";
import { initialize } from "./initialize.ts";
import { fixture } from "./testFixture.ts";

const names = (columns: { name: string }[]) => columns.map((column) => `"${column.name}"`).join(",");
const createTable = (table: PgTable) => {
	const config = getTableConfig(table);
	const columns = config.columns.map(
		(column) =>
			`"${column.name}" ${column.getSQLType()}${column.notNull ? " NOT NULL" : ""}${column.primary ? " PRIMARY KEY" : ""}`,
	);
	const primary = config.primaryKeys.map((key) => `PRIMARY KEY (${names(key.columns)})`);
	const unique = config.uniqueConstraints.map((key) => `UNIQUE (${names(key.columns)})`);
	const foreign = config.foreignKeys.map((key) => {
		const ref = key.reference();
		return `FOREIGN KEY (${names(ref.columns)}) REFERENCES "${getTableName(ref.foreignTable)}" (${names(ref.foreignColumns)}) ON DELETE ${key.onDelete}`;
	});
	return `CREATE TABLE "${config.name}" (${[...columns, ...primary, ...unique, ...foreign].join(",")})`;
};

export async function databaseFixture() {
	const db = await documentFixture();
	await db.$client.exec(`CREATE TABLE tickets (id text PRIMARY KEY); CREATE TABLE pull_requests (id text PRIMARY KEY);
		INSERT INTO tickets VALUES ('${flowV1FixtureIds.ticket}');`);
	for (const table of [
		tables.langflowExecutions,
		tables.langflowNativeHandles,
		tables.langflowCompletions,
		tables.langflowDecisions,
		tables.langflowOutbox,
		tables.langflowOwnershipReceipts,
		tables.langflowStops,
		tables.langflowDeadlines,
		tables.langflowExecutionProjections,
		tables.langflowSourceEvents,
		tables.langflowClassifications,
	]) {
		await db.$client.exec(createTable(table));
	}
	const f = fixture();
	const authority: DeliveryAuthorityV1 = {
		version: 1,
		...f.binding,
		hostId: "host",
		projectId: f.view.projectId,
		publicationDigest: f.view.publication!.documentHash,
		ownerId: "owner",
		ownershipRevision: 1,
		capabilityId: "capability",
		permissions: ["events.append"],
		issuedAt: "2026-09-29T06:00:00Z",
		expiresAt: "2026-09-30T06:00:00Z",
	};
	await db.insert(tables.langflowExecutions).values({
		executionId: f.view.id,
		flowId: f.view.flowId,
		ticketId: f.view.ticketId,
		projectId: f.view.projectId,
		diffId: null,
		reviewedHead: f.view.reviewedHead,
		publicationId: f.binding.publicationId,
		publicationRecordId: null,
		publication: f.view.publication!,
		snapshot: f.view.snapshot,
		hostId: "host",
		actorKind: "human",
		actorName: "reviewer",
		requestId: flowV1RequestId,
		requestBytes: "{}",
		submissionBytes: "{}",
		submission: {
			version: 1,
			hostId: "host",
			executionId: f.view.id,
			publicationId: f.binding.publicationId,
			requestId: flowV1RequestId,
			actor: { kind: "human", name: "reviewer" },
			requestDigest: "d".repeat(64),
			submissionDigest: "d".repeat(64),
			state: "submitted",
			correlation: null,
			admission: { state: "closed", barrierId: "barrier" },
			revision: 1,
		},
		engineJobId: f.binding.engineJobId,
		engineSessionId: "session",
		correlation: null,
		admission: { state: "closed", barrierId: "barrier" },
		authority,
		cancelIntent: null,
		revision: 1,
		createdAt: f.now,
	});
	const ctx: ServiceCtx = {
		actor: { kind: "system", name: "trellis" },
		session: null,
		reqId: "fixture",
		now: f.now,
		emit: () => undefined,
		cache: createCache(),
		actorCache: new Map(),
		dropBlobs: () => undefined,
		publicUrl: "http://localhost",
	};
	const call = <T>(action: (ctx: ServiceCtx, tx: Tx) => Promise<T>) =>
		withTx(db, (tx, emit) => action({ ...ctx, emit }, tx));
	await call((ctx, tx) => initialize(ctx, tx, { executionId: f.view.id }));
	f.observed.expectedRevision = 1;
	f.observed.occurrences = [];
	f.observed.status = "running";
	return { db, call, f, authority };
}
