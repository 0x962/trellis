import { executionViewV1Example, flowV1FixtureIds as ids, publicationV1Example } from "@trellis/api";
import { sql } from "drizzle-orm";
import { type DeliveryAuthorityV1, protocolDigest, type SubmissionV1 } from "../../../../langflowContracts";
import type { Db } from "../../../client";
import * as tables from "../../../tables/langflowExecution";
import { documentFixture } from "../../langflowDocuments/fixture";
import { saveInput } from "../../langflowDocuments/inputs.fixture";
import { insertDocumentPublication } from "../../langflowDocuments/insertPublication";
import { saveDocument } from "../../langflowDocuments/save";
import { openAdmission, reserveExecution } from "../executions";
import { initializeProjection } from "../projections";
import { tableSql } from "./schema";

export { ids };
export const now = new Date("2026-09-29T06:05:00Z");
export const requestBytes = '{ "request": "start" }\n';
export const submissionBytes = '{ "engine": "langflow" }\n';
export const jobId = "00000000-0000-4000-8000-000000000001";
export const authority: DeliveryAuthorityV1 = {
	version: 1,
	executionId: ids.execution,
	publicationId: ids.publication,
	engineJobId: jobId,
	engineEpoch: 1,
	hostId: "host-1",
	projectId: ids.project,
	publicationDigest: publicationV1Example.documentHash,
	ownerId: "owner-1",
	ownershipRevision: 1,
	capabilityId: "capability-1",
	permissions: ["native.reserve", "native.read", "completion.deliver", "decision.deliver", "events.append"],
	issuedAt: "2026-09-29T06:00:00Z",
	expiresAt: "2026-09-29T07:00:00Z",
};
export const admission = {
	version: 1 as const,
	executionId: ids.execution,
	publicationId: ids.publication,
	engineJobId: jobId,
	engineEpoch: 1,
	admissionId: "admission-1",
	submissionDigest: protocolDigest(submissionBytes),
	committedAt: now.toISOString(),
};
export async function receiptFixture(open = true, database?: Db) {
	const db = database ?? (await documentFixture());
	if (!database) {
		await db.$client.exec(
			"CREATE TABLE flow_executions(id text PRIMARY KEY); CREATE TABLE tickets(id text PRIMARY KEY); CREATE TABLE pull_requests(id text PRIMARY KEY);",
		);
		for (const table of [
			tables.langflowExecutions,
			tables.langflowStartReceipts,
			tables.langflowNativeHandles,
			tables.langflowCompletions,
			tables.langflowDecisions,
			tables.langflowOutbox,
			tables.langflowOwnershipReceipts,
			tables.langflowOwnerFences,
			tables.langflowAuthorityCommits,
			tables.langflowStops,
			tables.langflowDeadlines,
			tables.langflowExecutionProjections,
			tables.langflowSourceEvents,
			tables.langflowClassifications,
			tables.langflowWarnings,
		])
			await db.$client.exec(tableSql(table));
		await db.$client.exec(tables.authorityControlRowsSql);
		await db.execute(sql`INSERT INTO tickets VALUES (${ids.ticket})`);
		await db.execute(sql`INSERT INTO pull_requests VALUES (${ids.diff})`);
	}
	const saved = await db.transaction((tx) => saveDocument(tx, saveInput()));
	if (saved.state !== "saved") throw new Error("fixture_save_failed");
	const publication = { ...publicationV1Example, documentHash: saved.receipt.documentHash };
	await db.transaction((tx) => insertDocumentPublication(tx, publication));
	const { publication: _progress, lastExecutablePublication: _last, ...snapshot } = saved.receipt;
	const submission: SubmissionV1 = {
		version: 1,
		hostId: "host-1",
		executionId: ids.execution,
		publicationId: ids.publication,
		requestId: "00000000-0000-4000-8000-000000000003",
		actor: { kind: "human", name: "fixture" },
		requestDigest: protocolDigest(requestBytes),
		submissionDigest: protocolDigest(submissionBytes),
		state: "reserved",
		correlation: null,
		admission: { state: "closed", barrierId: "barrier-1" },
		revision: 1,
	};
	const input: typeof tables.langflowExecutions.$inferInsert = {
		executionId: ids.execution,
		flowId: ids.flow,
		ticketId: ids.ticket,
		projectId: ids.project,
		diffId: ids.diff,
		reviewedHead: "a".repeat(40),
		publicationId: ids.publication,
		publicationRecordId: ids.publication,
		publication,
		snapshot,
		hostId: "host-1",
		actorKind: "human",
		actorName: "fixture",
		requestId: submission.requestId,
		requestBytes,
		submissionBytes,
		submission,
		admission: submission.admission,
		revision: 1,
		createdAt: now,
	};
	await db.transaction((tx) => reserveExecution(tx, input));
	const liveAuthority = { ...authority, publicationDigest: publication.documentHash };
	if (open)
		await db.transaction((tx) =>
			openAdmission(tx, {
				executionId: ids.execution,
				correlation: {
					version: 1,
					hostId: "host-1",
					executionId: ids.execution,
					publicationId: ids.publication,
					submissionDigest: protocolDigest(submissionBytes),
					engineJobId: jobId,
					engineSessionId: "engine-session-1",
					recordedAt: now.toISOString(),
				},
				receipt: admission,
				authority: liveAuthority,
			}),
		);
	const view = { ...executionViewV1Example, snapshot, publication, revision: 1, lastEventSeq: 0 };
	await db.transaction((tx) => initializeProjection(tx, { view }));
	return { db, input, view, authority: liveAuthority };
}
