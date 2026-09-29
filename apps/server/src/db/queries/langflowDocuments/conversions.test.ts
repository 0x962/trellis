import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { legacyDocumentV1Example } from "@trellis/api";
import { sql } from "drizzle-orm";
import { langflowDocumentRevisions } from "../../tables/langflowDocuments/index.ts";
import { documentFixture } from "./fixture.ts";
import { flowId, savedAt } from "./inputs.fixture.ts";
import { insertDocumentConversion } from "./insertConversion.ts";
import { insertDocumentRevision } from "./insertRevision.ts";
import { readDocumentConversion } from "./readConversion.ts";
import { readDocumentRevision } from "./readRevision.ts";

describe("legacy source preservation", () => {
	let db: Awaited<ReturnType<typeof documentFixture>>;
	beforeEach(async () => {
		db = await documentFixture();
	});
	afterEach(async () => {
		await db.$client.close();
	});

	test("retains the supplied bytes and original metadata revision", async () => {
		const sourceBytes = Buffer.from('{ "nodes": [], "edges": [], "instruction": "é\\r\\n" }\r\n');
		const { publication: _publication, lastExecutablePublication: _last, ...legacy } = legacyDocumentV1Example;
		const snapshot = {
			...legacy,
			revision: 1,
			flow: { ...legacy.flow, version: 1 },
			documentHash: createHash("sha256").update(sourceBytes).digest("hex"),
		};
		await db.transaction((tx) => insertDocumentRevision(tx, { snapshot, sourceBytes, savedAt }));
		const stored = await db.transaction((tx) => readDocumentRevision(tx, { flowId, revision: 1 }));
		expect(stored!.sourceBytes.equals(sourceBytes)).toBe(true);
		expect(stored!.snapshot).toEqual(snapshot);
		expect((await db.execute(sql`SELECT version FROM flows`)).rows).toEqual([{ version: 1 }]);
		await expect(db.execute(sql`UPDATE langflow_document_revisions SET source_bytes = '\\x00'::bytea`)).rejects.toThrow(
			"Immutable document records",
		);
		await expect(
			db.transaction((tx) => insertDocumentRevision(tx, { snapshot, sourceBytes, savedAt })),
		).rejects.toThrow();
		await expect(
			db.insert(langflowDocumentRevisions).values({
				flowId,
				revision: 2,
				documentHash: snapshot.documentHash,
				componentManifestHash: null,
				sourceBytes: Buffer.from("different bytes"),
				snapshot: { ...snapshot, revision: 2, flow: { ...snapshot.flow, version: 2 } },
				savedAt,
			}),
		).rejects.toThrow();
	});

	test("keeps blocked conversion bytes without an invented target revision", async () => {
		const sourceBytes = Buffer.from([0, 255, 13, 10, 32, 123, 125]);
		const input = {
			migrationId: "00000000000000000000000011",
			flowId,
			sourceVersion: 71,
			sourceBytes,
			createdAt: savedAt,
			provenance: {
				sourceExportRef: "private/export-71",
				converterVersion: "1",
				targetEngineVersion: "pinned",
				targetDocumentHash: null,
				nodeMap: {},
				edgeMap: {},
				instructionHashes: {},
				state: "blocked" as const,
				diagnostics: [
					{
						code: "MISSING_SOURCE",
						severity: "error" as const,
						message: "The source lacks a retained revision.",
						path: [],
					},
				],
			},
		};
		await db.transaction((tx) => insertDocumentConversion(tx, input));
		const stored = await db.transaction((tx) => readDocumentConversion(tx, { migrationId: input.migrationId }));
		expect(stored!.sourceBytes.equals(sourceBytes)).toBe(true);
		expect(stored!.sourceDocumentHash).toBe(createHash("sha256").update(sourceBytes).digest("hex"));
		expect(stored!.provenance).toEqual(input.provenance);
		expect(await db.select().from(langflowDocumentRevisions)).toHaveLength(0);
		await expect(db.execute(sql`UPDATE langflow_document_conversions SET source_version = 72`)).rejects.toThrow(
			"Immutable document records",
		);
		await db.execute(sql`DELETE FROM flows WHERE id = ${flowId}`);
		expect(
			await db.transaction((tx) => readDocumentConversion(tx, { migrationId: input.migrationId })),
		).toBeUndefined();
	});
});
