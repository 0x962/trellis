import { afterEach, expect, test } from "bun:test";
import type {
	ConversionEditIntentV1,
	FlowDocumentContentV1,
	FlowDocumentV1,
	PublishDocumentV1Input,
} from "@trellis/api";
import { readDocumentAction, readDocumentSaveReceipt, saveDocument } from "../../../db/queries/langflowDocuments";
import { documentBytes } from "../documentBytes";
import type { DocumentActionReceiptInput } from "../documentIntentReceipt";
import { flowId, manifestHash, packageDigest, publisher, serviceFixture } from "../fixture";
import { get } from "../get";
import { legacyServices } from "../legacyServices";
import { publishSavedDocument } from "../publishSavedDocument";
import { capturePublication } from "../publishSavedDocument/components/capturePublication/capturePublication";
import { readDocumentActionReceipt } from "./readDocumentActionReceipt";

let f: Awaited<ReturnType<typeof serviceFixture>>;
afterEach(async () => {
	await f?.db.$client.close();
});
const setup = async () => {
	f = await serviceFixture("langflow");
	const document = await f.run((tx) => get(f.ctx, tx, { flow: flowId }));
	const intent: PublishDocumentV1Input = {
		flowId,
		expectedVersion: document.revision,
		expectedDocumentHash: document.documentHash,
		enginePackageDigest: packageDigest,
		componentManifestHash: manifestHash,
		requestId: crypto.randomUUID(),
	};
	return { document, intent };
};
const inputFor = (
	operation: DocumentActionReceiptInput["operation"],
	intent: PublishDocumentV1Input,
): DocumentActionReceiptInput => ({
	operation,
	value:
		operation === "edit"
			? ({
					...intent,
					schemaVersion: 1,
					edits: [
						{
							kind: "set-node-instruction",
							sourceNodeId: "00000000000000000000000003",
							instruction: "  Exact\ntext.  ",
						},
					],
				} satisfies ConversionEditIntentV1)
			: intent,
});

test.each(["publish", "convert", "edit"] as const)(
	"a %s miss reads without a claim or version change",
	async (operation) => {
		const { document, intent } = await setup();
		expect(await f.run((tx) => readDocumentActionReceipt(f.ctx, tx, inputFor(operation, intent)))).toEqual({
			state: "miss",
			requestId: intent.requestId,
		});
		expect(await f.run((tx) => readDocumentAction(tx, intent))).toBeNull();
		expect(await f.run((tx) => readDocumentSaveReceipt(tx, intent))).toBeUndefined();
		expect(await f.run((tx) => get(f.ctx, tx, { flow: flowId }))).toEqual(document);
	},
);

test("pending publication remains distinct and a later capture cannot authorize another POST", async () => {
	const { intent } = await setup();
	const bytes = documentBytes(intent).toString("utf8");
	const first = await f.run((tx) => capturePublication(f.ctx, tx, intent, bytes, () => {}));
	expect(first).toMatchObject({ state: "captured", replay: false });
	expect(await f.run((tx) => readDocumentActionReceipt(f.ctx, tx, inputFor("publish", intent)))).toEqual({
		state: "pending",
		requestId: intent.requestId,
	});
	const recovered = await f.run((tx) =>
		capturePublication(f.ctx, tx, intent, bytes, () => {
			throw new Error("unexpected_installed_access");
		}),
	);
	expect(recovered).toMatchObject({ state: "captured", replay: true });
});

test.each(["publish", "convert", "edit"] as const)(
	"completed %s replays exact bytes before current-state checks",
	async (operation) => {
		const { intent } = await setup();
		const input = inputFor(operation, intent);
		let original: FlowDocumentV1;
		if (operation === "publish") {
			const result = await publishSavedDocument(f.io, intent, {
				publisher: async () => publisher(),
				conversion: async () => null,
				installedIdentity: () => ({ enginePackageDigest: packageDigest, componentManifestHash: manifestHash }),
			});
			if (!("document" in result)) throw new Error("fixture_publication_pending");
			original = result.document;
		} else {
			const content: FlowDocumentContentV1 = {
				engine: "langflow",
				schemaVersion: 1,
				graphDocument: { nodes: [], edges: [] },
				componentManifestHash: manifestHash,
			};
			const saved = await f.run((tx) =>
				saveDocument(tx, {
					flowId,
					expectedVersion: intent.expectedVersion,
					requestId: intent.requestId,
					requestBytes: documentBytes(input.value),
					sourceBytes: documentBytes(content),
					content,
					diagnostics: [],
					savedAt: f.ctx.now,
				}),
			);
			if (!("receipt" in saved)) throw new Error("fixture_save_failed");
			original = saved.receipt;
		}
		await f.run((tx) =>
			legacyServices.update(f.ctx, tx, { flow: flowId, expectedVersion: original.revision, name: "Later name" }),
		);
		expect(await f.run((tx) => readDocumentActionReceipt(f.ctx, tx, input))).toEqual({
			state: "completed",
			requestId: intent.requestId,
			document: original,
		});
		const changed = inputFor(operation, { ...intent, enginePackageDigest: "f".repeat(64) });
		await expect(f.run((tx) => readDocumentActionReceipt(f.ctx, tx, changed))).rejects.toMatchObject({
			code: "FLOW_REQUEST_CONFLICT",
		});
	},
);

test("receipt lookup requires an actor before database access", async () => {
	const { intent } = await setup();
	await expect(
		f.run((tx) => readDocumentActionReceipt({ ...f.ctx, actor: null }, tx, inputFor("publish", intent))),
	).rejects.toThrow();
});
