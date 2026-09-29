import { afterEach, expect, test } from "bun:test";
import type { Db } from "../../client";
import { protocolDigest, type SourceEventV1 } from "../../../langflowContracts";
import { ids, jobId, now, receiptFixture } from "./fixtures/fixture";
import { commitProjection, findEvent, listEvents, readProjection, retainEvents } from "./projections";
let db: Db;
afterEach(async () => {
	await db.$client.close();
});
test("atomically stores the event identity, sequence, and projection", async () => {
	const fixture = await receiptFixture();
	db = fixture.db;
	const source: SourceEventV1 = {
		version: 1,
		executionId: ids.execution,
		publicationId: ids.publication,
		engineJobId: jobId,
		engineEpoch: 1,
		sourceEventId: "source-1",
		occurredAt: now.toISOString(),
		occurrence: null,
		payload: { kind: "execution_started", receiptId: "receipt-1" },
	};
	const sourceBytes = JSON.stringify(source);
	const event = { ...source, seq: 1, sourceDigest: protocolDigest(sourceBytes) };
	const input = {
		executionId: ids.execution,
		expectedRevision: 1,
		view: { ...fixture.view, revision: 2, lastEventSeq: 1 },
		event,
		sourceBytes,
	};
	await expect(
		db.transaction(async (tx) => {
			await commitProjection(tx, input);
			throw new Error("abort");
		}),
	).rejects.toThrow("abort");
	expect(await db.transaction((tx) => findEvent(tx, event))).toBeNull();
	expect((await db.transaction((tx) => readProjection(tx, input)))!.view.lastEventSeq).toBe(0);
	await db.transaction((tx) => commitProjection(tx, input));
	expect(
		await db.transaction((tx) => listEvents(tx, { executionId: ids.execution, afterSeq: 0, limit: 10000 })),
	).toEqual([event]);
	await expect(db.transaction((tx) => commitProjection(tx, input))).rejects.toThrow("projection_conflict");
	await db.transaction((tx) => retainEvents(tx, { executionId: ids.execution, firstAvailableSeq: 2 }));
	expect(await db.transaction((tx) => findEvent(tx, event))).toEqual(event);
	expect(
		await db.transaction((tx) => listEvents(tx, { executionId: ids.execution, afterSeq: 0, limit: 10000 })),
	).toEqual([]);
	expect((await db.transaction((tx) => readProjection(tx, input)))!.firstAvailableSeq).toBe(2);
});
test("rejects old epoch events without a projection update", async () => {
	const fixture = await receiptFixture();
	db = fixture.db;
	const source: SourceEventV1 = {
		version: 1,
		executionId: ids.execution,
		publicationId: ids.publication,
		engineJobId: jobId,
		engineEpoch: 2,
		sourceEventId: "source-1",
		occurredAt: now.toISOString(),
		occurrence: null,
		payload: { kind: "execution_started", receiptId: "receipt-1" },
	};
	const sourceBytes = JSON.stringify(source);
	await expect(
		db.transaction((tx) =>
			commitProjection(tx, {
				executionId: ids.execution,
				expectedRevision: 1,
				view: { ...fixture.view, revision: 2, lastEventSeq: 1 },
				event: { ...source, seq: 1, sourceDigest: protocolDigest(sourceBytes) },
				sourceBytes,
			}),
		),
	).rejects.toThrow("event_conflict");
	expect((await db.transaction((tx) => readProjection(tx, { executionId: ids.execution })))!.view.revision).toBe(1);
});
