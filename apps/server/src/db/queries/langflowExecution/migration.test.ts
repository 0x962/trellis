import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { type Db, openDb } from "../../client";
import { migrate } from "../../migrate";
import { saveInput } from "../langflowDocuments/inputs.fixture";
import { readDocumentPublication } from "../langflowDocuments/readPublication";
import { readDocumentRevision } from "../langflowDocuments/readRevision";
import { readDocumentSaveReceipt } from "../langflowDocuments/readSaveReceipt";
import { classificationStore } from "./classification";
import { readExecution, reserveExecution } from "./executions";
import { ids, now, receiptFixture } from "./fixtures/fixture";
import { beforeDocuments, migrationsDir } from "./fixtures/migration";
import { handle, nativeRequest } from "./fixtures/native";
import { reserveNative } from "./native";

let db: Db;
afterEach(async () => {
	await db.$client.close();
});
test("the migration chain preserves legacy rows and durable receipts across reopen and deletion", async () => {
	db = await beforeDocuments();
	const before = (await db.execute(sql`SELECT * FROM flow_executions WHERE id='legacy-execution'`)).rows;
	const legacyFlows = (await db.execute(sql`SELECT * FROM flows ORDER BY id`)).rows;
	expect(await migrate(db)).toBe(2);
	expect((await db.execute(sql`SELECT * FROM flows ORDER BY id`)).rows).toEqual(legacyFlows);
	expect((await db.execute(sql`SELECT * FROM flow_executions WHERE id='legacy-execution'`)).rows).toEqual(before);
	const fixture = await receiptFixture(true, db);
	expect((await db.transaction((tx) => reserveExecution(tx, fixture.input))).executionId).toBe(ids.execution);
	await expect(
		db.transaction((tx) => reserveExecution(tx, { ...fixture.input, requestBytes: "changed" })),
	).rejects.toThrow("identity_conflict");
	await expect(
		db.execute(sql`UPDATE langflow_document_revisions SET revision=revision WHERE flow_id=${ids.flow}`),
	).rejects.toThrow("Immutable document records");
	await db.execute(sql`UPDATE langflow_document_publication_states SET version=version+1 WHERE flow_id=${ids.flow}`);
	await expect(
		db.transaction(async (tx) => {
			await reserveNative(tx, {
				requestBytes: JSON.stringify(nativeRequest),
				taskKey: "root/agent",
				handle,
				authority: fixture.authority,
				now,
			});
			throw new Error("abort");
		}),
	).rejects.toThrow("abort");
	expect((await db.execute(sql`SELECT count(*)::integer AS n FROM langflow_native_handles`)).rows).toEqual([{ n: 0 }]);
	const claim = await db.transaction((tx) =>
		classificationStore.claim(tx, {
			binding: {
				executionId: ids.execution,
				publicationId: ids.publication,
				diffId: ids.diff,
				reviewedHead: fixture.input.reviewedHead!,
			},
			ownerToken: "owner-token",
			requestBytes: "original classification bytes",
		}),
	);
	const savedInput = saveInput();
	const savedRevision = await db.transaction((tx) => readDocumentRevision(tx, { flowId: ids.flow, revision: 2 }));
	const savedReceipt = await db.transaction((tx) => readDocumentSaveReceipt(tx, savedInput));
	expect(savedRevision!.sourceBytes.equals(savedInput.sourceBytes)).toBe(true);
	expect(savedRevision!.documentHash).toBe(createHash("sha256").update(savedInput.sourceBytes).digest("hex"));
	const backup = await db.$client.dumpDataDir();
	await db.$client.close();
	db = await openDb(":memory:", backup);
	expect(await migrate(db)).toBe(0);
	expect(await db.transaction((tx) => readDocumentRevision(tx, { flowId: ids.flow, revision: 2 }))).toEqual(
		savedRevision,
	);
	expect(await db.transaction((tx) => readDocumentSaveReceipt(tx, savedInput))).toEqual(savedReceipt);
	expect(await db.transaction((tx) => readDocumentPublication(tx, { flowId: ids.flow, revision: 2 }))).toEqual(
		fixture.input.publication,
	);
	expect(await db.transaction((tx) => classificationStore.read(tx, { executionId: ids.execution }))).toEqual(
		claim.receipt,
	);
	await db.execute(sql`DELETE FROM flows WHERE id=${ids.flow}`);
	const retained = await db.transaction((tx) => readExecution(tx, { executionId: ids.execution }));
	expect(retained!.publicationRecordId).toBeNull();
	expect(retained!.publication).toEqual(fixture.input.publication);
	expect(retained!.snapshot).toEqual(fixture.input.snapshot);
	expect((await db.execute(sql`SELECT * FROM flow_executions WHERE id='legacy-execution'`)).rows).toEqual(before);
	await db.execute(sql`DELETE FROM tickets WHERE id=${ids.ticket}`);
	expect(await db.transaction((tx) => readExecution(tx, { executionId: ids.execution }))).toBeNull();
	expect((await db.execute(sql`SELECT count(*)::integer AS n FROM langflow_classifications`)).rows).toEqual([{ n: 0 }]);
}, 60000);
test("the saved snapshots retain the stable migration predecessors", async () => {
	db = await openDb(":memory:");
	const snapshots = await Promise.all(
		[132, 133, 134].map(async (n) =>
			JSON.parse(await readFile(join(migrationsDir, `meta/0${n}_snapshot.json`), "utf8")),
		),
	);
	expect(snapshots[0].id).toBe("adbf3ad7-2710-4bbf-b232-45137ece19fe");
	expect(snapshots[1].prevId).toBe(snapshots[0].id);
	expect(snapshots[2].prevId).toBe(snapshots[1].id);
	expect(snapshots[2].tables["public.flows"]).toEqual(snapshots[0].tables["public.flows"]);
});
