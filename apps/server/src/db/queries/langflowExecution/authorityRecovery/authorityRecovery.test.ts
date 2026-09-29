import { afterEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { protocolDigest, type StopObligationV1 } from "../../../../langflowContracts";
import type { Db } from "../../../client";
import { migrate } from "../../../migrate";
import {
	langflowExecutionProjections,
	langflowExecutions,
	langflowOutbox,
	langflowStops,
} from "../../../tables/langflowExecution";
import { ids, now, receiptFixture } from "../fixtures/fixture";
import { beforeDocuments } from "../fixtures/migration";
import { handle, nativeRequest } from "../fixtures/native";
import { reserveNative } from "../native";
import { cancelExecution, recordStop, updateStop } from "../stops";
import { listAuthorityExecutions } from "./listAuthorityExecutions";
import { readTakeoverStops } from "./readTakeoverStops";

let db: Db;
afterEach(async () => db.$client.close());
const input = { executionId: ids.execution };
async function setup(native = false) {
	db = await beforeDocuments(141);
	await migrate(db);
	const fixture = await receiptFixture(true, db);
	if (native)
		await db.transaction((tx) =>
			reserveNative(tx, {
				requestBytes: JSON.stringify(nativeRequest),
				taskKey: "review",
				handle,
				authority: fixture.authority,
				now,
			}),
		);
	return fixture;
}
function obligation(): StopObligationV1 {
	return {
		version: 1,
		obligationId: "stop-1",
		...input,
		stepId: handle.stepId,
		agentRunId: handle.agentRunId,
		attemptId: handle.attemptId,
		reason: "canceled",
		requestedAt: now.toISOString(),
		revision: 1,
		state: "pending",
		exitReceipt: null,
	};
}
function confirmed(): StopObligationV1 {
	return {
		...obligation(),
		revision: 2,
		state: "confirmed",
		exitReceipt: {
			attemptId: handle.attemptId,
			receiptId: "exit-1",
			exitedAt: now.toISOString(),
			confirmedAt: now.toISOString(),
		},
	};
}

test("retains noncanceled attempts but requires every existing stop to have exact exit proof", async () => {
	await setup(true);
	expect((await db.transaction((tx) => readTakeoverStops(tx, input))).ready).toBe(true);
	await db.transaction((tx) => recordStop(tx, { obligation: obligation() }));
	expect((await db.transaction((tx) => readTakeoverStops(tx, input))).ready).toBe(false);
	await db.transaction((tx) => updateStop(tx, { expectedRevision: 1, obligation: confirmed() }));
	const evidence = await db.transaction((tx) => readTakeoverStops(tx, input));
	expect(evidence.ready).toBe(true);
	expect(evidence.sourceDigest).toBe(protocolDigest(evidence.sourceBytes));
	expect(JSON.parse(evidence.sourceBytes).stops[0]).toEqual(confirmed());
	expect(await db.transaction((tx) => readTakeoverStops(tx, input))).toEqual(evidence);
}, 60000);

test("canceled executions require exact confirmed stops for every attempt", async () => {
	await setup(true);
	const [row] = await db.select().from(langflowExecutions);
	await db.transaction((tx) =>
		cancelExecution(tx, {
			intent: {
				version: 1,
				...input,
				requestId: crypto.randomUUID(),
				expectedRevision: row!.revision,
				actor: { kind: "human", name: "fixture" },
				requestedAt: now.toISOString(),
			},
			obligations: [obligation()],
		}),
	);
	expect((await db.transaction((tx) => readTakeoverStops(tx, input))).ready).toBe(false);
	await db.transaction((tx) => updateStop(tx, { expectedRevision: 1, obligation: confirmed() }));
	expect((await db.transaction((tx) => readTakeoverStops(tx, input))).ready).toBe(true);
	await db.delete(langflowStops);
	expect((await db.transaction((tx) => readTakeoverStops(tx, input))).ready).toBe(false);
}, 60000);

test("enumerates only same-host active rows and canceled rows with pending engine cancellation", async () => {
	const fixture = await setup();
	const query = { hostId: "host-1", afterExecutionId: null, limit: 1 };
	const page = await db.transaction((tx) => listAuthorityExecutions(tx, query));
	expect(page).toEqual({ items: [input], nextAfterExecutionId: ids.execution });
	expect(
		(await db.transaction((tx) => listAuthorityExecutions(tx, { ...query, afterExecutionId: ids.execution }))).items,
	).toEqual([]);
	expect((await db.transaction((tx) => listAuthorityExecutions(tx, { ...query, hostId: "other-host" }))).items).toEqual(
		[],
	);
	await db.update(langflowExecutionProjections).set({ view: { ...fixture.view, status: "succeeded" } });
	expect((await db.transaction((tx) => listAuthorityExecutions(tx, query))).items).toEqual([]);
	const [row] = await db.select().from(langflowExecutions);
	await db.transaction((tx) =>
		cancelExecution(tx, {
			intent: {
				version: 1,
				...input,
				requestId: crypto.randomUUID(),
				expectedRevision: row!.revision,
				actor: { kind: "human", name: "fixture" },
				requestedAt: now.toISOString(),
			},
			obligations: [],
		}),
	);
	expect((await db.transaction((tx) => listAuthorityExecutions(tx, query))).items).toEqual([input]);
	await db
		.update(langflowOutbox)
		.set({ receipt: { state: "unknown" } })
		.where(eq(langflowOutbox.kind, "cancel"));
	expect((await db.transaction((tx) => listAuthorityExecutions(tx, query))).items).toEqual([input]);
	await db
		.update(langflowOutbox)
		.set({ receipt: { state: "confirmed" } })
		.where(eq(langflowOutbox.kind, "cancel"));
	expect((await db.transaction((tx) => listAuthorityExecutions(tx, query))).items).toEqual([]);
}, 60000);
