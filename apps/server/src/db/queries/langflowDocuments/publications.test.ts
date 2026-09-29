import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { publicationV1Example } from "@trellis/api";
import { sql } from "drizzle-orm";
import { documentFixture } from "./fixture.ts";
import { flowId, saveInput } from "./inputs.fixture.ts";
import { insertDocumentPublication } from "./insertPublication.ts";
import { readDocumentPublication } from "./readPublication.ts";
import { saveDocument } from "./save.ts";

describe("immutable publication bindings", () => {
	let db: Awaited<ReturnType<typeof documentFixture>>;
	let publication: typeof publicationV1Example;
	beforeEach(async () => {
		db = await documentFixture();
		const saved = await db.transaction((tx) => saveDocument(tx, saveInput()));
		if (saved.state !== "saved") throw new Error("Expected a saved receipt.");
		publication = { ...publicationV1Example, documentHash: saved.receipt.documentHash, conversion: null };
	});
	afterEach(async () => {
		await db.$client.close();
	});

	test("binds one publication to the exact revision, source hash, and manifest", async () => {
		await expect(
			db.transaction((tx) => insertDocumentPublication(tx, { ...publication, documentHash: "f".repeat(64) })),
		).rejects.toThrow();
		await expect(
			db.transaction((tx) => insertDocumentPublication(tx, { ...publication, componentManifestHash: "f".repeat(64) })),
		).rejects.toThrow();
		await db.transaction((tx) => insertDocumentPublication(tx, publication));
		expect(await db.transaction((tx) => readDocumentPublication(tx, { flowId, revision: 2 }))).toEqual(publication);
		await expect(
			db.transaction((tx) =>
				insertDocumentPublication(tx, {
					...publication,
					publicationId: "00000000000000000000000003",
					engineFlowId: "replacement",
				}),
			),
		).rejects.toThrow();
		await expect(db.execute(sql`UPDATE langflow_document_publications SET publication = '{}'::jsonb`)).rejects.toThrow(
			"Immutable document records",
		);
	});

	test("keeps the original save receipt when publication completes", async () => {
		await db.transaction((tx) => insertDocumentPublication(tx, publication));
		const retry = await db.transaction((tx) => saveDocument(tx, saveInput()));
		if (retry.state !== "replayed") throw new Error("Expected a replayed receipt.");
		expect(retry.receipt.publication.state).toBe("pending");
		expect(retry.receipt.lastExecutablePublication).toBeNull();
		const next = await db.transaction((tx) =>
			saveDocument(
				tx,
				saveInput({
					expectedVersion: 2,
					requestId: "d06af527-3b2f-4ccf-b527-7ae95515a061",
					requestBytes: Buffer.from("next revision"),
				}),
			),
		);
		if (next.state !== "saved") throw new Error("Expected a saved receipt.");
		expect(next.receipt.lastExecutablePublication).toEqual(publication);
		expect(next.receipt.publication).toEqual({ state: "pending", revision: 3 });
	});

	test("keeps existing catalog deletion cascades", async () => {
		await db.transaction((tx) => insertDocumentPublication(tx, publication));
		await db.execute(sql`DELETE FROM flows WHERE id = ${flowId}`);
		const result = await db.execute(sql`SELECT
			(SELECT count(*) FROM langflow_document_revisions)::int AS revisions,
			(SELECT count(*) FROM langflow_document_save_receipts)::int AS receipts,
			(SELECT count(*) FROM langflow_document_publications)::int AS publications`);
		expect(result.rows).toEqual([{ revisions: 0, receipts: 0, publications: 0 }]);
	});
});
