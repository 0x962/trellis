import { afterEach, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import type { Db } from "../../client";
import { ids, now, receiptFixture } from "./fixtures/fixture";
import { handle, nativeRequest } from "./fixtures/native";
import { reserveNative } from "./native";
import { recordDeadline } from "./stops";

let db: Db;
afterEach(async () => {
	await db.$client.close();
});
test("stores long uncompressible graph keys without an index size limit", async () => {
	const fixture = await receiptFixture();
	db = fixture.db;
	const key = randomBytes(10000).toString("hex");
	const request = {
		...nativeRequest,
		occurrenceKey: key,
		parentOccurrenceKey: key,
		iterationPath: [{ loopNodeId: key, round: 501 }],
	};
	const saved = await db.transaction((tx) =>
		reserveNative(tx, {
			requestBytes: JSON.stringify(request),
			taskKey: key,
			handle,
			authority: fixture.authority,
			now,
		}),
	);
	expect(saved.taskKey).toBe(key);
	expect(saved.provenance.request.iterationPath[0]!.loopNodeId).toBe(key);
	const deadline = {
		deadlineId: "deadline-1",
		groupOccurrenceKey: key,
		budgetMs: 1000000000,
		launchedAt: null,
		deadlineAt: null,
		launchReceiptId: null,
	};
	expect(await db.transaction((tx) => recordDeadline(tx, { executionId: ids.execution, deadline }))).toEqual(deadline);
});
