import { afterEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { protocolDigest } from "../../../langflowContracts";
import { type Db, openDb } from "../../client";
import { migrate } from "../../migrate";
import { type ActionReceiptInput, readActionReceipt, saveActionReceipt } from "./actionReceipts";
import { beforeDocuments } from "./fixtures/migration";

let db: Db;
afterEach(async () => db.$client.close());
function refusedInput(errorCode = "FLOW_VERSION_CONFLICT"): ActionReceiptInput {
	const requestBytes = '{ "id": "missing", "requestId": "request-1" }\r\n';
	const fields = {
		permit: {
			id: "refused-permit",
			dataHomeId: "home-1",
			generation: 1,
			binding: {
				effectId: "refused-effect",
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
		outcome: "refused" as const,
		executionId: null,
		viewRevision: null,
		errorCode,
		errorBytes: ` {"code":"${errorCode}","status":412,"defined":true,"message":"Version changed","data":{"version":7}}\r\n`,
		receiptId: "refusal-1",
		recordedAt: "2026-09-29T20:00:00.000Z",
	};
	return { ...fields, sourceBytes: JSON.stringify({ version: 1, ...fields }) };
}
test("the forward migration preserves historical completed bytes and retains refused actions", async () => {
	db = await beforeDocuments(137);
	const input = refusedInput();
	const { outcome: _outcome, errorCode: _error, errorBytes: _errorBytes, sourceBytes: _source, ...oldFields } = input;
	const historical = {
		...oldFields,
		permit: { ...input.permit, id: "old-permit", binding: { ...input.permit.binding, effectId: "old-effect" } },
		executionId: "old-execution",
		viewRevision: 3,
	};
	const oldBytes = ` ${JSON.stringify({ version: 1, ...historical })}\r\n`;
	await db.execute(sql`INSERT INTO langflow_action_receipts
		(permit_id,effect_id,permit,request_bytes,request_digest,execution_id,view_revision,receipt_id,recorded_at,source_bytes,source_digest)
		VALUES ('old-permit','old-effect',${JSON.stringify(historical.permit)}::jsonb,${historical.requestBytes},${historical.requestDigest},'old-execution',3,${historical.receiptId},${historical.recordedAt}::timestamptz,${oldBytes},${protocolDigest(oldBytes)})`);
	expect(await migrate(db)).toBe(1);
	const old = (await db.transaction((tx) => readActionReceipt(tx, { permitId: "old-permit" })))!;
	expect(old.outcome).toBe("completed");
	expect(old.errorCode).toBeNull();
	expect(old.errorBytes).toBeNull();
	expect(old.sourceBytes).toBe(oldBytes);
	expect(old.sourceDigest).toBe(protocolDigest(oldBytes));
	await expect(
		db.transaction(async (tx) => {
			await saveActionReceipt(tx, input);
			throw new Error("abort");
		}),
	).rejects.toThrow("abort");
	expect(await db.transaction((tx) => readActionReceipt(tx, { permitId: input.permit.id }))).toBeNull();
	const saved = await db.transaction((tx) => saveActionReceipt(tx, input));
	expect(saved.outcome).toBe("refused");
	expect(saved.executionId).toBeNull();
	expect(saved.viewRevision).toBeNull();
	expect(saved.errorCode).toBe(input.errorCode);
	expect(saved.errorBytes).toBe(input.errorBytes);
	expect(saved.sourceBytes).toBe(input.sourceBytes);
	expect(saved.requestBytes).toBe(input.requestBytes);
	expect(await db.transaction((tx) => saveActionReceipt(tx, input))).toEqual(saved);
	await expect(db.transaction((tx) => saveActionReceipt(tx, refusedInput("NOT_FOUND")))).rejects.toThrow(
		"action_receipt_identity_conflict",
	);
	for (const changes of [
		{ outcome: "unknown" },
		{ errorCode: null },
		{ errorCode: "" },
		{ errorBytes: null },
		{ errorBytes: "" },
		{ executionId: "execution" },
		{ viewRevision: 1 },
		{ outcome: "completed", errorCode: null, errorBytes: null },
		{ outcome: "completed", executionId: "execution", viewRevision: 1 },
	]) {
		const { sourceBytes: _bytes, ...base } = input;
		const fields = { ...base, ...changes };
		const invalid = { ...fields, sourceBytes: JSON.stringify({ version: 1, ...fields }) } as ActionReceiptInput;
		await expect(db.transaction((tx) => saveActionReceipt(tx, invalid))).rejects.toThrow("langflow_action_outcome");
	}
	await expect(
		db.execute(sql`UPDATE langflow_action_receipts SET error_code='CHANGED' WHERE permit_id=${input.permit.id}`),
	).rejects.toThrow("Immutable action receipts");
	await expect(db.execute(sql`DELETE FROM langflow_action_receipts`)).rejects.toThrow("Immutable action receipts");
	const archive = await db.$client.dumpDataDir();
	await db.$client.close();
	db = await openDb(":memory:", archive);
	expect(await db.transaction((tx) => readActionReceipt(tx, { permitId: input.permit.id }))).toEqual(saved);
	expect(await db.transaction((tx) => readActionReceipt(tx, { permitId: "old-permit" }))).toEqual(old);
}, 60000);
