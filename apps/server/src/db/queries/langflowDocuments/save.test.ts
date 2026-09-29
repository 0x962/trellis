import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FlowDocumentV1Schema } from "@trellis/api";
import { eq, sql } from "drizzle-orm";
import { flows } from "../../tables/flows.ts";
import { langflowDocumentSaveReceipts } from "../../tables/langflowDocuments/index.ts";
import { documentFixture } from "./fixture.ts";
import { flowId, saveInput } from "./inputs.fixture.ts";
import { readDocumentRevision } from "./readRevision.ts";
import { saveDocument } from "./save.ts";

describe("immutable document saves", () => {
	let db: Awaited<ReturnType<typeof documentFixture>>;
	beforeEach(async () => {
		db = await documentFixture();
	});
	afterEach(async () => {
		await db.$client.close();
	});

	test("replays the original response after metadata changes", async () => {
		const input = saveInput();
		const first = await db.transaction((tx) => saveDocument(tx, input));
		expect(first.state).toBe("saved");
		if (first.state !== "saved") throw new Error("Expected a saved receipt.");
		expect(FlowDocumentV1Schema.parse(first.receipt)).toEqual(first.receipt);
		await db.update(flows).set({ name: "Renamed", version: 3 }).where(eq(flows.id, flowId));
		const retry = await db.transaction((tx) => saveDocument(tx, input));
		expect(retry).toEqual({ state: "replayed", receipt: first.receipt });
		expect(await db.select().from(langflowDocumentSaveReceipts)).toHaveLength(1);
		const stored = await db.transaction((tx) => readDocumentRevision(tx, { flowId, revision: 2 }));
		expect(stored!.sourceBytes.equals(input.sourceBytes)).toBe(true);
		expect(stored!.snapshot.flow.name).toBe("Review");
	});

	test("rejects changed bytes even when the request JSON is equal", async () => {
		const input = saveInput();
		await db.transaction((tx) => saveDocument(tx, input));
		const result = await db.transaction((tx) =>
			saveDocument(tx, {
				...input,
				requestBytes: Buffer.from(JSON.stringify(JSON.parse(input.requestBytes.toString()))),
			}),
		);
		expect(result).toEqual({ state: "request_conflict", requestId: input.requestId });
		expect((await db.select().from(flows))[0]!.version).toBe(2);
	});

	test("compares the same version that metadata edits advance", async () => {
		await db.update(flows).set({ version: 2, name: "Metadata edit" }).where(eq(flows.id, flowId));
		expect(await db.transaction((tx) => saveDocument(tx, saveInput()))).toEqual({
			state: "version_conflict",
			version: 2,
		});
		expect(await db.select().from(langflowDocumentSaveReceipts)).toHaveLength(0);
		const result = await db.transaction((tx) => saveDocument(tx, saveInput({ expectedVersion: 2 })));
		if (result.state !== "saved") throw new Error("Expected a saved receipt.");
		expect(result.receipt.flow).toMatchObject({ id: flowId, name: "Metadata edit", project: "TRL", version: 3 });
		expect((await db.select().from(flows))[0]!.projectId).toBe("00000000000000000000000006");
	});

	test("serializes duplicate requests and conflicting tab saves", async () => {
		const input = saveInput();
		const duplicates = await Promise.all([
			db.transaction((tx) => saveDocument(tx, input)),
			db.transaction((tx) => saveDocument(tx, input)),
		]);
		expect(duplicates.map((result) => result.state)).toEqual(["saved", "replayed"]);
		const secondTab = await db.transaction((tx) =>
			saveDocument(
				tx,
				saveInput({
					requestId: "d06af527-3b2f-4ccf-b527-7ae95515a061",
					requestBytes: Buffer.from("second tab"),
				}),
			),
		);
		expect(secondTab).toEqual({ state: "version_conflict", version: 2 });
	});

	test("rolls back the catalog version and receipt with the caller transaction", async () => {
		await expect(
			db.transaction(async (tx) => {
				await saveDocument(tx, saveInput());
				throw new Error("Abort the transaction.");
			}),
		).rejects.toThrow("Abort the transaction.");
		expect((await db.select().from(flows))[0]!.version).toBe(1);
		expect(await db.select().from(langflowDocumentSaveReceipts)).toHaveLength(0);
	});

	test("keeps the global catalog scope and accepts content beyond former ceilings", async () => {
		await db.update(flows).set({ projectId: null }).where(eq(flows.id, flowId));
		const input = saveInput();
		input.content = {
			...input.content,
			engine: "langflow",
			componentManifestHash: "c".repeat(64),
			graphDocument: { instruction: "x".repeat(200_001), nodes: Array.from({ length: 501 }, (_, id) => ({ id })) },
		};
		input.sourceBytes = Buffer.from(JSON.stringify(input.content));
		const result = await db.transaction((tx) => saveDocument(tx, input));
		if (result.state !== "saved") throw new Error("Expected a saved receipt.");
		expect(result.receipt.flow.project).toBeNull();
		const stored = await db.transaction((tx) => readDocumentRevision(tx, { flowId, revision: 2 }));
		expect(stored!.sourceBytes.equals(input.sourceBytes)).toBe(true);
	});

	test("refuses receipt updates and duplicate request rows", async () => {
		await db.transaction((tx) => saveDocument(tx, saveInput()));
		await expect(db.execute(sql`UPDATE langflow_document_save_receipts SET receipt = '{}'::jsonb`)).rejects.toThrow(
			"Immutable document records",
		);
		const [receipt] = await db.select().from(langflowDocumentSaveReceipts);
		await expect(db.insert(langflowDocumentSaveReceipts).values(receipt!)).rejects.toThrow();
	});
});
