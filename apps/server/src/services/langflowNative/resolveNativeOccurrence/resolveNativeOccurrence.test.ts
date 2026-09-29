import { afterEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { langflowDeadlines, langflowExecutions } from "../../../db/tables/langflowExecution";
import { protocolDigest } from "../../../langflowContracts";
import { occurrenceFixture } from "./fixture";
import { resolveNativeOccurrence } from "./resolveNativeOccurrence";

const databases: Awaited<ReturnType<typeof occurrenceFixture>>["db"][] = [];
afterEach(async () => {
	for (const db of databases.splice(0)) await db.$client.close();
});
async function fixture(omitModel = false) {
	const result = await occurrenceFixture(omitModel);
	databases.push(result.db);
	return result;
}

test("resolves the actual retained specification and exact journal inputs in the database transaction", async () => {
	const { db, ctx, request, visit } = await fixture();
	const approved = await db.transaction((tx) =>
		resolveNativeOccurrence(ctx, tx, { requestBytes: visit.requestBytes, visit }),
	);
	expect(approved.engineNodeId).toBe("vertex");
	expect(approved.instruction).toBe("  Original instruction.\nPreserve spacing.  ");
	expect(approved.harness.model).toBe("openai/gpt-6-astra");
	expect(approved.harness.effort).toBe("high");
	expect(approved.inputReceipts).toEqual(visit.inputReceipts);
	expect(approved.requestDigest).toBe(protocolDigest(visit.requestBytes));
	expect(approved.taskKey).toBe(JSON.stringify(["review", request.nodeId, "outer.501", "step", [["outer", 501]]]));
});

test("rejects changed bytes, scope, occurrence, admission, and receipts after the external read", async () => {
	const { db, ctx, visit } = await fixture();
	for (const changed of [
		{ ...visit, requestBytes: `${visit.requestBytes} ` },
		{ ...visit, engineNodeId: "other" },
		{ ...visit, occurrence: { ...visit.occurrence, phase: "condition" as const } },
		{ ...visit, scope: { ...visit.scope, groupDeadlineRefs: ["other"] } },
		{ ...visit, admissionReceipt: { ...visit.admissionReceipt, admissionId: "other" } },
		{ ...visit, inputReceipts: [] },
	])
		await expect(
			db.transaction((tx) =>
				resolveNativeOccurrence(ctx, tx, {
					requestBytes: visit.requestBytes,
					visit: changed,
				}),
			),
		).rejects.toThrow();
});

test("rechecks authority and cancellation after the external read", async () => {
	const { db, ctx, request, visit } = await fixture();
	const changed = { ...ctx, nativeAuthority: { ...ctx.nativeAuthority, capabilityId: "old-grant" } };
	await expect(
		db.transaction((tx) => resolveNativeOccurrence(changed, tx, { requestBytes: visit.requestBytes, visit })),
	).rejects.toThrow("authority_conflict");
	await db
		.update(langflowExecutions)
		.set({
			cancelIntent: {
				version: 1,
				executionId: request.executionId,
				requestId: crypto.randomUUID(),
				actor: { kind: "human", name: "fixture" },
				expectedRevision: 1,
				requestedAt: ctx.now.toISOString(),
			},
		})
		.where(eq(langflowExecutions.executionId, request.executionId));
	await expect(
		db.transaction((tx) => resolveNativeOccurrence(ctx, tx, { requestBytes: visit.requestBytes, visit })),
	).rejects.toThrow("admission_closed");
});

test("rejects unresolved model policy without provider defaults", async () => {
	const { db, ctx, visit } = await fixture(true);
	await expect(
		db.transaction((tx) => resolveNativeOccurrence(ctx, tx, { requestBytes: visit.requestBytes, visit })),
	).rejects.toThrow("native_policy_unresolved");
});

test("requires the exact group deadline record and rejects its elapsed clock", async () => {
	const { db, ctx, request, visit } = await fixture();
	request.groupDeadlineRefs = ["clock"];
	visit.scope.groupDeadlineRefs = request.groupDeadlineRefs;
	visit.requestBytes = JSON.stringify(request);
	await expect(
		db.transaction((tx) => resolveNativeOccurrence(ctx, tx, { requestBytes: visit.requestBytes, visit })),
	).rejects.toThrow("native_deadline_missing");
	await db.insert(langflowDeadlines).values({
		id: "clock",
		executionId: request.executionId,
		groupOccurrenceKey: "outer.501",
		groupDigest: protocolDigest("outer.501"),
		deadline: {
			deadlineId: "clock",
			groupOccurrenceKey: "outer.501",
			budgetMs: 1000,
			launchedAt: new Date(ctx.now.getTime() - 2000).toISOString(),
			deadlineAt: new Date(ctx.now.getTime() - 1000).toISOString(),
			launchReceiptId: "launch",
		},
	});
	await expect(
		db.transaction((tx) => resolveNativeOccurrence(ctx, tx, { requestBytes: visit.requestBytes, visit })),
	).rejects.toThrow("native_deadline_elapsed");
});
