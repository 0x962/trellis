import { afterEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { protocolDigest } from "../../../langflowContracts";
import { type Db, openDb } from "../../client";
import { migrate } from "../../migrate";
import { type ActionReceiptInput, readActionReceipt, saveActionReceipt } from "./actionReceipts";
import { beforeDocuments } from "./fixtures/migration";

let db: Db;
afterEach(async () => {
	await db.$client.close();
});
function input(overrides: Partial<Extract<ActionReceiptInput, { outcome: "completed" }>> = {}): ActionReceiptInput {
	const requestBytes = '{ "operation": "start", "source": "é" }\r\n';
	const fields = {
		permit: {
			id: "permit-1",
			dataHomeId: "home-1",
			generation: 3,
			binding: {
				effectId: "effect-1",
				kind: "admission" as const,
				executionId: null,
				attemptId: null,
				jobId: null,
				requestId: "request-1",
				payloadDigest: protocolDigest(requestBytes),
			},
		},
		requestBytes,
		requestDigest: protocolDigest(requestBytes),
		outcome: "completed" as const,
		executionId: "execution-1",
		viewRevision: 2,
		errorCode: null,
		errorBytes: null,
		receiptId: "receipt-1",
		recordedAt: "2026-09-29T20:00:00.000Z",
		...overrides,
	};
	return { ...fields, sourceBytes: JSON.stringify({ version: 1, ...fields }) };
}
test("retains immutable exact action receipts through rollback, replay, and archive restore", async () => {
	db = await beforeDocuments(136);
	expect(await migrate(db)).toBe(2);
	const original = input();
	await expect(
		db.transaction(async (tx) => {
			await saveActionReceipt(tx, original);
			throw new Error("abort");
		}),
	).rejects.toThrow("abort");
	expect(await db.transaction((tx) => readActionReceipt(tx, { permitId: original.permit.id }))).toBeNull();
	const saved = await db.transaction((tx) => saveActionReceipt(tx, original));
	expect(saved.sourceBytes).toBe(original.sourceBytes);
	expect(saved.sourceDigest).toBe(protocolDigest(original.sourceBytes));
	expect(saved.permit).toEqual(original.permit);
	expect(await db.transaction((tx) => saveActionReceipt(tx, original))).toEqual(saved);
	await expect(
		db.transaction((tx) => saveActionReceipt(tx, { ...original, sourceBytes: `${original.sourceBytes} ` })),
	).rejects.toThrow("action_receipt_identity_conflict");
	await expect(db.transaction((tx) => saveActionReceipt(tx, input({ viewRevision: 3 })))).rejects.toThrow(
		"action_receipt_identity_conflict",
	);
	await expect(
		db.transaction((tx) => saveActionReceipt(tx, input({ permit: { ...original.permit, id: "other" } }))),
	).rejects.toThrow("action_receipt_identity_conflict");
	await expect(db.transaction((tx) => saveActionReceipt(tx, { ...original, requestBytes: "changed" }))).rejects.toThrow(
		"action_receipt_bytes_conflict",
	);
	await expect(db.execute(sql`UPDATE langflow_action_receipts SET view_revision=3`)).rejects.toThrow(
		"Immutable action receipts",
	);
	await expect(db.execute(sql`DELETE FROM langflow_action_receipts`)).rejects.toThrow("Immutable action receipts");
	const archive = await db.$client.dumpDataDir();
	await db.$client.close();
	db = await openDb(":memory:", archive);
	expect(await migrate(db)).toBe(0);
	expect(await db.transaction((tx) => readActionReceipt(tx, { permitId: original.permit.id }))).toEqual(saved);
}, 60000);
