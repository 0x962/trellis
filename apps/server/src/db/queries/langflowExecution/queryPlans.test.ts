import { afterEach, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/pglite";
import type { Db } from "../../client";
import * as schema from "../../schema";
import { ids, jobId, now, receiptFixture } from "./fixtures/fixture";
import { handle, nativeRequest } from "./fixtures/native";
import { reserveNative } from "./native";
import { findEvent } from "./projections";
import { recordDeadline } from "./stops";

let db: Db;
afterEach(async () => {
	await db.$client.close();
});
test("event and deadline lookups use their complete digest index keys", async () => {
	const fixture = await receiptFixture();
	const queries: { query: string; params: unknown[] }[] = [];
	db = drizzle({
		client: fixture.db.$client,
		schema,
		logger: {
			logQuery(query, params) {
				queries.push({ query, params });
			},
		},
	});
	await db.$client.exec("SET enable_seqscan=off");
	await db.transaction((tx) => findEvent(tx, { engineJobId: jobId, sourceEventId: "source-1" }));
	await db.transaction((tx) =>
		recordDeadline(tx, {
			executionId: ids.execution,
			deadline: {
				deadlineId: "deadline-1",
				groupOccurrenceKey: "root",
				budgetMs: 1000,
				launchedAt: null,
				deadlineAt: null,
				launchReceiptId: null,
			},
		}),
	);
	await db.transaction((tx) =>
		reserveNative(tx, {
			requestBytes: JSON.stringify(nativeRequest),
			taskKey: "root/agent",
			handle,
			authority: fixture.authority,
			now,
		}),
	);
	for (const [table, digest] of [
		["langflow_source_events", "source_identity_digest"],
		["langflow_deadlines", "group_digest"],
	]) {
		const query = queries.find((q) => q.query.startsWith("select") && q.query.includes(`from "${table}"`))!;
		const plan = await db.$client.query(`EXPLAIN (FORMAT JSON) ${query.query}`, query.params);
		const conditions = indexConditions(plan.rows);
		expect(conditions.some((condition) => condition.includes(digest!))).toBe(true);
	}
	const native = queries.find(
		(q) => q.query.startsWith("select") && q.query.includes('from "langflow_native_handles"'),
	)!;
	const where = native.query.split("where")[1]!;
	expect(where).toContain('"semantic_digest" =');
	expect(where).toContain('"occurrence_digest" =');
});
function indexConditions(value: unknown): string[] {
	if (!value || typeof value !== "object") return [];
	return Object.entries(value).flatMap(([key, child]) =>
		key === "Index Cond" ? [String(child)] : indexConditions(child),
	);
}
