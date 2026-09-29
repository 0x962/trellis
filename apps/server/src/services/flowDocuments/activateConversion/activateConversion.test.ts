import { afterEach, expect, test } from "bun:test";
import { readDocumentSaveReceipt } from "../../../db/queries/langflowDocuments";
import type { DocumentActionServices } from "../documentActionServices";
import { flowId, manifestHash, packageDigest, publisher, serviceFixture } from "../fixture";
import { get } from "../get";
import { activateConversion } from "./activateConversion";

let f: Awaited<ReturnType<typeof serviceFixture>>;
afterEach(async () => { await f?.db.$client.close(); });

test("missing compiler preserves the legacy document and saves no conversion receipt", async () => {
	f = await serviceFixture();
	const before = await f.run((tx) => get(f.ctx, tx, { flow: flowId }));
	const input = {
		flowId, expectedVersion: before.revision, expectedDocumentHash: before.documentHash,
		componentManifestHash: manifestHash, enginePackageDigest: packageDigest, requestId: crypto.randomUUID(),
	};
	const services: DocumentActionServices = {
		publisher: async () => publisher(), conversion: async () => null,
		installedIdentity: () => ({ enginePackageDigest: packageDigest, componentManifestHash: manifestHash }),
	};
	expect(await activateConversion(f.io, input, services)).toMatchObject({ state: "blocked", diagnostics: [{ code: "conversion_producer_unavailable" }] });
	expect(await f.run((tx) => get(f.ctx, tx, { flow: flowId }))).toEqual(before);
	expect(await f.run((tx) => readDocumentSaveReceipt(tx, input))).toBeUndefined();
});
