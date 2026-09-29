import { afterEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { protocolDigest } from "../../../langflowContracts";
import type { Db } from "../../client";
import { openAdmission, reserveExecution } from "./executions";
import { admission, ids, jobId, now, receiptFixture, submissionBytes } from "./fixtures/fixture";
import { handle, nativeRequest } from "./fixtures/native";
import { reserveNative } from "./native";
import { commitProjection } from "./projections";
import { bindExecution, confirmAdmission } from "./submission";

let db: Db;
afterEach(async () => {
	await db.$client.close();
});
test.each(["succeeded", "failed", "canceled"] as const)("replays the original start after %s", async (status) => {
	const fixture = await receiptFixture();
	db = fixture.db;
	await db.transaction((tx) =>
		commitProjection(tx, {
			executionId: ids.execution,
			expectedRevision: 1,
			view: { ...fixture.view, revision: 2, status },
			event: null,
			sourceBytes: null,
		}),
	);
	expect((await db.transaction((tx) => reserveExecution(tx, fixture.input))).executionId).toBe(ids.execution);
	await expect(
		db.transaction((tx) => reserveExecution(tx, { ...fixture.input, requestBytes: "changed after terminal" })),
	).rejects.toThrow("identity_conflict");
});
test("binding preserves closed admission until its receipt and outbox commit", async () => {
	const fixture = await receiptFixture(false);
	db = fixture.db;
	const native = {
		requestBytes: JSON.stringify(nativeRequest),
		taskKey: "root/agent",
		handle,
		authority: fixture.authority,
		now,
	};
	await expect(db.transaction((tx) => reserveNative(tx, native))).rejects.toThrow();
	const correlation = {
		version: 1 as const,
		hostId: "host-1",
		executionId: ids.execution,
		publicationId: ids.publication,
		submissionDigest: protocolDigest(submissionBytes),
		engineJobId: jobId,
		engineSessionId: "engine-session-1",
		recordedAt: now.toISOString(),
	};
	const bound = await db.transaction((tx) =>
		bindExecution(tx, { executionId: ids.execution, correlation, authority: fixture.authority }),
	);
	expect(bound.admission.state).toBe("closed");
	await expect(db.transaction((tx) => reserveNative(tx, native))).rejects.toThrow("admission_closed");
	const input = { executionId: ids.execution, correlation, receipt: admission, authority: fixture.authority };
	await expect(
		db.transaction(async (tx) => {
			await openAdmission(tx, input);
			throw new Error("abort");
		}),
	).rejects.toThrow("abort");
	expect((await db.execute(sql`SELECT count(*)::integer AS n FROM langflow_outbox`)).rows).toEqual([{ n: 0 }]);
	await expect(db.transaction((tx) => reserveNative(tx, native))).rejects.toThrow("admission_closed");
	await db.transaction((tx) => openAdmission(tx, input));
	expect((await db.transaction((tx) => reserveNative(tx, native))).handle).toEqual(handle);
	await expect(
		db.transaction((tx) =>
			confirmAdmission(tx, { executionId: ids.execution, receipt: { ...admission, engineEpoch: 2 } }),
		),
	).rejects.toThrow("admission_receipt_conflict");
	await db.transaction((tx) => confirmAdmission(tx, input));
	expect((await db.execute(sql`SELECT receipt FROM langflow_outbox WHERE kind='admission'`)).rows).toEqual([
		{ receipt: admission },
	]);
});
