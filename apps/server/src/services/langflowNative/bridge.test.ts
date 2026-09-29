import { afterEach, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { createCache } from "../../db/cache";
import { ids, now, receiptFixture } from "../../db/queries/langflowExecution/fixtures/fixture";
import { handle, nativeRequest } from "../../db/queries/langflowExecution/fixtures/native";
import { reserveNative } from "../../db/queries/langflowExecution/native";
import { langflowExecutions, langflowNativeHandles, langflowOutbox } from "../../db/tables/langflowExecution";
import { protocolDigest } from "../../langflowContracts";
import { readCompletionDelivery } from "./readCompletionDelivery";
import { readNativeOutput } from "./readNativeOutput";
import { recordNativeObservation } from "./recordNativeObservation";
import { reserveNativeRequest } from "./reserveNativeRequest";
import { runtimeFixture } from "./runtimeFixture/runtimeFixture";
import type { NativeReservationCtx } from "./types";

const databases: Awaited<ReturnType<typeof receiptFixture>>["db"][] = [];
afterEach(async () => {
	for (const db of databases.splice(0)) await db.$client.close();
});

async function fixture() {
	const { db, authority } = await receiptFixture();
	databases.push(db);
	const requestBytes = JSON.stringify(nativeRequest);
	await db.transaction((tx) =>
		reserveNative(tx, { requestBytes, taskKey: "outer/501/review:step", handle, authority, now }),
	);
	const ctx: NativeReservationCtx = {
		home: "/unused-replay-fixture",
		dispatchGate: {
			acquire: () => {
				throw new Error("Unexpected dispatch on replay");
			},
		},
		actor: { kind: "system", name: "trellis" },
		session: null,
		reqId: crypto.randomUUID(),
		now,
		cache: createCache(),
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4521",
		nativeAuthority: authority,
		resolveOccurrence: async () => {
			throw new Error("Unexpected publication resolution on replay");
		},
	};
	await db.$client.exec(`CREATE TABLE agent_runs(id text PRIMARY KEY, terminal_id text, session_id text, workspace_id text, error text);
		CREATE TABLE native_workspace_observations(step_id text PRIMARY KEY, workspace_commit text);`);
	await db.execute(
		sql`INSERT INTO agent_runs VALUES (${handle.agentRunId},${handle.attemptId},NULL,'/fixture/work',NULL)`,
	);
	const recordWorkspace: Parameters<typeof recordNativeObservation>[0]["recordWorkspace"] = async (tx, observation) => {
		await tx.execute(sql`INSERT INTO native_workspace_observations VALUES (${observation.stepId},${observation.workspaceCommit})
			ON CONFLICT (step_id) DO UPDATE SET workspace_commit=excluded.workspace_commit`);
	};
	return { db, ctx, requestBytes, observationCtx: { ...ctx, recordWorkspace } };
}

test("replays one durable handle after the caller loses its reservation response", async () => {
	const { db, ctx, requestBytes } = await fixture();
	const first = await db.transaction((tx) => reserveNativeRequest(ctx, tx, { requestBytes }));
	const afterRestart = await db.transaction((tx) => reserveNativeRequest({ ...ctx }, tx, { requestBytes }));
	expect(afterRestart.reservation.handle).toEqual(first.reservation.handle);
	expect(afterRestart.launch).toBeNull();
	expect(await db.select().from(langflowNativeHandles)).toHaveLength(1);
});

test("rejects changed bytes, relabeled occurrences, and forged authority", async () => {
	const { db, ctx, requestBytes } = await fixture();
	for (const changed of [
		`${requestBytes}\n`,
		JSON.stringify({ ...nativeRequest, specHash: "b".repeat(64) }),
		JSON.stringify({ ...nativeRequest, occurrenceKey: "replacement", requestId: crypto.randomUUID() }),
	])
		await expect(db.transaction((tx) => reserveNativeRequest(ctx, tx, { requestBytes: changed }))).rejects.toThrow(
			"identity_conflict",
		);
	const forged = { ...ctx, nativeAuthority: { ...ctx.nativeAuthority, capabilityId: "forged" } };
	await expect(db.transaction((tx) => reserveNativeRequest(forged, tx, { requestBytes }))).rejects.toThrow(
		"authority_conflict",
	);
	expect(await db.select().from(langflowNativeHandles)).toHaveLength(1);
});

test("stores a late session, a full result, and its outbox in one transaction", async () => {
	const { db, observationCtx } = await fixture();
	const runtime = runtimeFixture(handle);
	runtime.result!.text = `${"result".repeat(200_000)}\n`;
	const input = { executionId: ids.execution, stepId: handle.stepId, runtime, workspaceCommit: "c".repeat(40) };
	const first = await db.transaction((tx) => recordNativeObservation(observationCtx, tx, input));
	expect(first.handle.providerSessionId).toBe("session-1");
	expect(first.handle.workspaceId).toBe(`workspace:${handle.agentRunId}`);
	expect(first.completion!.completion.result.output).toBe(runtime.result!.text);
	const replay = await db.transaction((tx) => recordNativeObservation(observationCtx, tx, structuredClone(input)));
	expect(replay.completion!.completionId).toBe(first.completion!.completionId);
	const outbox = await db.select().from(langflowOutbox).where(eq(langflowOutbox.kind, "completion"));
	expect(outbox).toHaveLength(1);
	expect(protocolDigest(outbox[0]!.payloadBytes)).toBe(first.completion!.resultDigest);
});

test("rejects changed output under the same result identity", async () => {
	const { db, observationCtx } = await fixture();
	const input = {
		executionId: ids.execution,
		stepId: handle.stepId,
		runtime: runtimeFixture(handle),
		workspaceCommit: null,
	};
	await db.transaction((tx) => recordNativeObservation(observationCtx, tx, input));
	input.runtime.result!.text = "changed";
	await expect(db.transaction((tx) => recordNativeObservation(observationCtx, tx, input))).rejects.toThrow(
		"identity_conflict",
	);
});

test("rejects another session before it fills an empty native session field", async () => {
	const { db, observationCtx } = await fixture();
	const input = {
		executionId: ids.execution,
		stepId: handle.stepId,
		runtime: runtimeFixture(handle),
		workspaceCommit: null,
	};
	input.runtime.activity!.state = "working";
	await db.transaction((tx) => recordNativeObservation(observationCtx, tx, input));
	await db.execute(sql`UPDATE agent_runs SET session_id=NULL WHERE id=${handle.agentRunId}`);
	input.runtime.agent!.sessionId = "another-session";
	await expect(db.transaction((tx) => recordNativeObservation(observationCtx, tx, input))).rejects.toThrow(
		"native_session_conflict",
	);
	const saved = await db.execute(sql`SELECT session_id FROM agent_runs WHERE id=${handle.agentRunId}`);
	expect(saved.rows[0]!.session_id).toBeNull();
});

test("rolls back the observation and result when the transaction fails", async () => {
	const { db, observationCtx } = await fixture();
	await expect(
		db.transaction(async (tx) => {
			await recordNativeObservation(observationCtx, tx, {
				executionId: ids.execution,
				stepId: handle.stepId,
				runtime: runtimeFixture(handle),
				workspaceCommit: null,
			});
			throw new Error("fixture_crash_before_commit");
		}),
	).rejects.toThrow("fixture_crash_before_commit");
	const [saved] = await db.select().from(langflowNativeHandles);
	expect(saved!.handle.providerSessionId).toBeNull();
	expect(await db.select().from(langflowOutbox).where(eq(langflowOutbox.kind, "completion"))).toHaveLength(0);
});

test("retains a late result after cancel and blocks completion delivery", async () => {
	const { db, observationCtx, ctx } = await fixture();
	await db
		.update(langflowExecutions)
		.set({
			cancelIntent: {
				version: 1,
				executionId: ids.execution,
				requestId: crypto.randomUUID(),
				expectedRevision: 2,
				requestedAt: now.toISOString(),
				actor: { kind: "human", name: "fixture" },
			},
		})
		.where(eq(langflowExecutions.executionId, ids.execution));
	const result = await db.transaction((tx) =>
		recordNativeObservation(observationCtx, tx, {
			executionId: ids.execution,
			stepId: handle.stepId,
			runtime: runtimeFixture(handle),
			workspaceCommit: null,
		}),
	);
	expect(result.handle.state).toBe("canceled");
	expect(result.completion).not.toBeNull();
	await expect(
		db.transaction((tx) =>
			readCompletionDelivery(ctx, tx, {
				executionId: ids.execution,
				completionId: result.completion!.completionId,
			}),
		),
	).rejects.toThrow("execution_canceled");
});

test("reads retained output after the native run changes attempts", async () => {
	const { db, observationCtx, ctx } = await fixture();
	const completed = await db.transaction((tx) =>
		recordNativeObservation(observationCtx, tx, {
			executionId: ids.execution,
			stepId: handle.stepId,
			runtime: runtimeFixture(handle),
			workspaceCommit: null,
		}),
	);
	const input = {
		executionId: ids.execution,
		stepId: handle.stepId,
		agentRunId: handle.agentRunId,
		attemptId: handle.attemptId,
		resultId: completed.completion!.resultId,
	};
	await db.execute(sql`UPDATE agent_runs SET terminal_id=${crypto.randomUUID()} WHERE id=${handle.agentRunId}`);
	const retained = await db.transaction((tx) => readNativeOutput(ctx, tx, input));
	expect(retained.status).toBe("available");
	if (retained.status === "available") expect(retained.result.output).toBe("YES\n");
	for (const field of ["executionId", "stepId", "agentRunId", "attemptId", "resultId"] as const) {
		const missing = await db.transaction((tx) => readNativeOutput(ctx, tx, { ...input, [field]: "another" }));
		expect(missing.status).toBe("unavailable");
	}
});
