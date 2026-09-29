import { afterEach, expect, test } from "bun:test";
import type { Db } from "../../client";
import { ids, receiptFixture } from "./fixtures/fixture";
import { reserveExecution } from "./executions";
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
