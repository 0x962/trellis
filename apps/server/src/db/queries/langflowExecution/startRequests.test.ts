import { afterEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Db } from "../../client";
import { reserveExecution } from "./executions";
import { ids, receiptFixture } from "./fixtures/fixture";
import { readStartRequest, saveStartRequest } from "./startRequests";
import { markSubmissionUnknown } from "./submission";

let db: Db;
afterEach(async () => {
	await db.$client.close();
});
test("a permanent alias returns the original execution after submission", async () => {
	const fixture = await receiptFixture();
	db = fixture.db;
	const alias = {
		actorKind: "human",
		actorName: "second",
		requestId: crypto.randomUUID(),
		requestBytes: "alias",
		executionId: ids.execution,
	};
	await db.transaction((tx) => saveStartRequest(tx, alias));
	expect(await db.transaction((tx) => readStartRequest(tx, alias))).toEqual(alias);
	const replay = await db.transaction((tx) =>
		reserveExecution(tx, { ...fixture.input, ...alias, executionId: "unused" }),
	);
	expect(replay.executionId).toBe(ids.execution);
	await expect(db.transaction((tx) => saveStartRequest(tx, { ...alias, requestBytes: "different" }))).rejects.toThrow(
		"identity_conflict",
	);
	expect(
		(await db.transaction((tx) => markSubmissionUnknown(tx, { executionId: ids.execution }))).submission.state,
	).toBe("submitted");
});

test("retains request aliases for legacy runs and their deletion cascade", async () => {
	({ db } = await receiptFixture());
	await db.execute(sql`INSERT INTO flow_executions VALUES ('legacy-1')`);
	const alias = {
		actorKind: "human",
		actorName: "fixture",
		requestId: crypto.randomUUID(),
		requestBytes: "legacy reuse",
		executionId: "legacy-1",
	};
	expect(await db.transaction((tx) => saveStartRequest(tx, alias))).toEqual(alias);
	expect(await db.transaction((tx) => readStartRequest(tx, alias))).toEqual(alias);
	await db.execute(sql`DELETE FROM flow_executions WHERE id='legacy-1'`);
	expect(await db.transaction((tx) => readStartRequest(tx, alias))).toBeNull();
});
