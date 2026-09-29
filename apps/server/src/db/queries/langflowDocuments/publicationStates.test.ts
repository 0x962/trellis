import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { publicationV1Example } from "@trellis/api";
import { openDb } from "../../client.ts";
import { documentFixture } from "./fixture.ts";
import { flowId, saveInput } from "./inputs.fixture.ts";
import { insertDocumentPublication } from "./insertPublication.ts";
import { readLastDocumentPublication } from "./readLastPublication.ts";
import { readLatestDocumentRevision } from "./readLatestRevision.ts";
import { readDocumentPublicationState } from "./readPublicationState.ts";
import { readDocumentSaveReceipt } from "./readSaveReceipt.ts";
import { saveDocument } from "./save.ts";
import { writeDocumentPublicationState } from "./writePublicationState.ts";

const failure = {
	state: "failed" as const,
	revision: 2,
	diagnostics: [
		{ code: "ENGINE_UNAVAILABLE", message: "The engine is unavailable.", severity: "error" as const, path: [] },
	],
};

describe("durable publication progress", () => {
	let db: Awaited<ReturnType<typeof documentFixture>>;
	beforeEach(async () => {
		db = await documentFixture();
		await db.transaction((tx) => saveDocument(tx, saveInput()));
	});
	afterEach(async () => {
		await db.$client.close();
	});

	test("retains failures after the database reopens", async () => {
		expect(
			await db.transaction((tx) =>
				writeDocumentPublicationState(tx, {
					flowId,
					revision: 2,
					expectedVersion: 1,
					state: failure,
				}),
			),
		).toEqual({ state: "updated", version: 2 });
		const archive = await db.$client.dumpDataDir("none");
		await db.$client.close();
		db = await openDb(":memory:", archive);
		expect(await db.transaction((tx) => readDocumentPublicationState(tx, { flowId, revision: 2 }))).toEqual({
			version: 2,
			state: failure,
		});
		const receipt = await db.transaction((tx) => readDocumentSaveReceipt(tx, saveInput()));
		expect(receipt!.receipt.publication.state).toBe("pending");
		expect(receipt!.requestBytes.equals(saveInput().requestBytes)).toBe(true);
	});

	test("rejects a prior state version and preserves a newer revision", async () => {
		await db.transaction((tx) =>
			writeDocumentPublicationState(tx, {
				flowId,
				revision: 2,
				expectedVersion: 1,
				state: failure,
			}),
		);
		expect(
			await db.transaction((tx) =>
				writeDocumentPublicationState(tx, {
					flowId,
					revision: 2,
					expectedVersion: 1,
					state: { state: "pending", revision: 2 },
				}),
			),
		).toEqual({ state: "conflict", version: 2 });
		await db.transaction((tx) =>
			saveDocument(
				tx,
				saveInput({
					expectedVersion: 2,
					requestId: "d06af527-3b2f-4ccf-b527-7ae95515a061",
					requestBytes: Buffer.from("next revision"),
				}),
			),
		);
		await db.transaction((tx) =>
			writeDocumentPublicationState(tx, {
				flowId,
				revision: 2,
				expectedVersion: 2,
				state: { ...failure, state: "blocked" },
			}),
		);
		expect(await db.transaction((tx) => readDocumentPublicationState(tx, { flowId, revision: 3 }))).toEqual({
			version: 1,
			state: { state: "pending", revision: 3 },
		});
		expect((await db.transaction((tx) => readLatestDocumentRevision(tx, { flowId })))!.revision).toBe(3);
	});

	test("keeps the immutable publication after a late failure", async () => {
		const document = await db.transaction((tx) => readLatestDocumentRevision(tx, { flowId }));
		const publication = { ...publicationV1Example, documentHash: document!.documentHash, conversion: null };
		await db.transaction((tx) => insertDocumentPublication(tx, publication));
		expect(
			await db.transaction((tx) =>
				writeDocumentPublicationState(tx, {
					flowId,
					revision: 2,
					expectedVersion: 1,
					state: failure,
				}),
			),
		).toEqual({ state: "published", publication });
		expect(await db.transaction((tx) => readDocumentPublicationState(tx, { flowId, revision: 2 }))).toEqual({
			version: 1,
			state: { state: "published", revision: 2, publication },
		});
		expect(await db.transaction((tx) => readLastDocumentPublication(tx, { flowId }))).toEqual(publication);
	});
});
