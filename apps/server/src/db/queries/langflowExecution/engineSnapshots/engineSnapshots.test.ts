import { afterEach, expect, test } from "bun:test";
import { type Db, openDb } from "../../../client";
import { migrate } from "../../../migrate";
import { protocolDigest } from "../../../../langflowContracts";
import { ids, jobId, now, receiptFixture } from "../fixtures/fixture";
import { beforeDocuments } from "../fixtures/migration";
import { commitProjection, readProjection } from "../projections";
import { readEngineSnapshot } from "./engineSnapshots";

let db: Db;
afterEach(async () => db.$client.close());
async function setup() {
	db = await beforeDocuments(141);
	await migrate(db);
	return receiptFixture(true, db);
}
function snapshot(sourceCursor = 1001) {
	const checkpoint = {
		version: 1, executionId: ids.execution, publicationId: ids.publication,
		engineJobId: jobId, engineEpoch: 1, checkpointId: "checkpoint-1",
		revision: 1, continuationRef: "continue-1", waits: [],
	};
	const snapshotBytes = ` ${JSON.stringify({
		version: 1, executionId: ids.execution, publicationId: ids.publication,
		engineJobId: jobId, engineEpoch: 1, sourceCursor, capturedAt: now.toISOString(),
		checkpointBytes: ` ${JSON.stringify(checkpoint)}\n`, graphCheckpointBytes: '{ "graph": [] }\n',
		occurrenceJournalBytes: ' [ ]\r\n', jobStatus: "waiting", jobOutcomeBytes: null,
	})}\r\n`;
	return { sourceCursor, snapshotBytes };
}

test("keeps original snapshot strings and a cursor independent of event sequence after reopen", async () => {
	const fixture = await setup();
	const engineSnapshot = snapshot();
	await db.transaction((tx) => commitProjection(tx, {
		executionId: ids.execution, expectedRevision: 1,
		view: { ...fixture.view, revision: 2 }, event: null, sourceBytes: null, engineSnapshot,
	}));
	const archive = await db.$client.dumpDataDir();
	await db.$client.close();
	db = await openDb(":memory:", archive);
	expect(await db.transaction((tx) => readEngineSnapshot(tx, { executionId: ids.execution })))
		.toEqual({ ...engineSnapshot, snapshotDigest: protocolDigest(engineSnapshot.snapshotBytes) });
	const projection = await db.transaction((tx) => readProjection(tx, { executionId: ids.execution }));
	expect(projection!.view.lastEventSeq).toBe(0);
	expect(projection!.view.revision).toBe(2);
}, 60000);

test("refuses changed equal cursors, older cursors, and stale projection revisions", async () => {
	const fixture = await setup();
	const input = {
		executionId: ids.execution, expectedRevision: 1,
		view: { ...fixture.view, revision: 2 }, event: null, sourceBytes: null, engineSnapshot: snapshot(),
	};
	await db.transaction((tx) => commitProjection(tx, input));
	await expect(db.transaction((tx) => commitProjection(tx, input))).rejects.toThrow("projection_conflict");
	const next = { ...input, expectedRevision: 2, view: { ...fixture.view, revision: 3 } };
	await expect(db.transaction((tx) => commitProjection(tx, {
		...next, engineSnapshot: { ...snapshot(), snapshotBytes: `${snapshot().snapshotBytes} ` },
	}))).rejects.toThrow("engine_snapshot_cursor_conflict");
	await expect(db.transaction((tx) => commitProjection(tx, {
		...next, engineSnapshot: snapshot(1000),
	}))).rejects.toThrow("engine_snapshot_cursor_conflict");
	await db.transaction((tx) => commitProjection(tx, next));
	expect((await db.transaction((tx) => readProjection(tx, input)))!.view.revision).toBe(3);
}, 60000);

test("rolls back snapshot and projection together and refuses a foreign job or epoch", async () => {
	const fixture = await setup();
	const input = {
		executionId: ids.execution, expectedRevision: 1,
		view: { ...fixture.view, revision: 2 }, event: null, sourceBytes: null, engineSnapshot: snapshot(),
	};
	await expect(db.transaction(async (tx) => {
		await commitProjection(tx, input);
		throw new Error("abort");
	})).rejects.toThrow("abort");
	expect(await db.transaction((tx) => readEngineSnapshot(tx, input))).toBeNull();
	expect((await db.transaction((tx) => readProjection(tx, input)))!.view.revision).toBe(1);
	for (const change of [{ engineJobId: "another-job" }, { engineEpoch: 2 }]) {
		const bytes = JSON.stringify({ ...JSON.parse(snapshot().snapshotBytes), ...change });
		await expect(db.transaction((tx) => commitProjection(tx, {
			...input, engineSnapshot: { sourceCursor: 1001, snapshotBytes: bytes },
		}))).rejects.toThrow("engine_snapshot_identity_conflict");
	}
}, 60000);
