import { afterEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { type Db, openDb } from "../../../client";
import { migrate } from "../../../migrate";
import { langflowDocumentActions } from "../../../tables/langflowDocuments/actions";
import { beforeDocuments } from "../../langflowExecution/fixtures/migration";
import { saveInput } from "../inputs.fixture";
import { saveDocument } from "../save";
import { claimDocumentAction, completeDocumentAction, readDocumentAction } from "./documentActions";

let db: Db;
afterEach(async () => db.$client.close());
async function setup() {
	db = await beforeDocuments(142);
	await migrate(db);
	const saved = await db.transaction((tx) => saveDocument(tx, saveInput()));
	if (saved.state !== "saved") throw new Error("fixture_save_failed");
	return {
		document: saved.receipt,
		input: { flowId: saved.receipt.flow.id, requestId: crypto.randomUUID(), action: "publish" as const,
			requestBytes: ' { "request": "publish" }\r\n', revision: saved.receipt.revision, createdAt: new Date() },
	};
}

test("retains pending bytes through reopen and rejects changed request identities", async () => {
	const { input } = await setup();
	const claimed = await db.transaction((tx) => claimDocumentAction(tx, input));
	expect(claimed.state).toBe("claimed");
	expect(claimed.record.document).toBeNull();
	const archive = await db.$client.dumpDataDir();
	await db.$client.close();
	db = await openDb(":memory:", archive);
	expect(await db.transaction((tx) => readDocumentAction(tx, input))).toEqual(claimed.record);
	const replay = await db.transaction((tx) => claimDocumentAction(tx, { ...input, createdAt: new Date(input.createdAt.getTime() + 1000) }));
	expect(replay).toEqual({ state: "replayed", record: claimed.record });
	for (const changed of [{ requestBytes: `${input.requestBytes} ` }, { action: "convert" as const }]) {
		expect((await db.transaction((tx) => claimDocumentAction(tx, { ...input, ...changed }))).state).toBe("request_conflict");
	}
}, 60000);

test("completes the captured revision after newer edits and preserves the original final receipt", async () => {
	const { input, document } = await setup();
	await db.transaction((tx) => claimDocumentAction(tx, input));
	await db.transaction((tx) => saveDocument(tx, saveInput({
		expectedVersion: document.revision, requestId: crypto.randomUUID(), requestBytes: Buffer.from("later"),
	})));
	const completed = await db.transaction((tx) => completeDocumentAction(tx, { ...input, document }));
	expect(completed).toEqual(document);
	expect(await db.transaction((tx) => completeDocumentAction(tx, { ...input, document }))).toEqual(document);
	await expect(db.transaction((tx) => completeDocumentAction(tx, {
		...input, document: { ...document, flow: { ...document.flow, name: "Changed" } },
	}))).rejects.toThrow("document_action_receipt_conflict");
	await expect(db.update(langflowDocumentActions).set({ document: null })).rejects.toThrow();
	await expect(db.update(langflowDocumentActions).set({ requestBytes: "changed" })).rejects.toThrow();
}, 60000);

test("rolls back claims and completion and keeps the flow deletion cascade", async () => {
	const { input, document } = await setup();
	await expect(db.transaction(async (tx) => {
		await claimDocumentAction(tx, input);
		throw new Error("abort");
	})).rejects.toThrow("abort");
	expect(await db.transaction((tx) => readDocumentAction(tx, input))).toBeNull();
	await db.transaction((tx) => claimDocumentAction(tx, input));
	await expect(db.transaction(async (tx) => {
		await completeDocumentAction(tx, { ...input, document });
		throw new Error("abort");
	})).rejects.toThrow("abort");
	expect((await db.transaction((tx) => readDocumentAction(tx, input)))!.document).toBeNull();
	await db.execute(sql`DELETE FROM flows WHERE id = ${input.flowId}`);
	expect(await db.transaction((tx) => readDocumentAction(tx, input))).toBeNull();
}, 60000);
