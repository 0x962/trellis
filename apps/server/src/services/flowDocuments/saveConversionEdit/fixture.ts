import { createHash } from "node:crypto";
import type { ConversionEditIntentV1, PreparedConversionEditV1 } from "../../langflowMigration";
import { documentBytes } from "../documentBytes";
import { flowId, manifestHash, packageDigest, serviceFixture } from "../fixture";
import { get } from "../get";
import type { ConversionEditServices } from "./saveConversionEdit";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function editFixture() {
	const f = await serviceFixture("langflow");
	const base = await f.run((tx) => get(f.ctx, tx, { flow: flowId }));
	const intent: ConversionEditIntentV1 = {
		schemaVersion: 1,
		flowId,
		expectedVersion: base.revision,
		expectedDocumentHash: base.documentHash,
		componentManifestHash: manifestHash,
		enginePackageDigest: packageDigest,
		requestId: crypto.randomUUID(),
		edits: [{ kind: "set-flow-briefing", briefing: "  Retained\nbriefing.  " }],
	};
	const prepare: ConversionEditServices["prepare"] = async ({ base: captured, requestBytes }) => {
		const intentBytes = Buffer.from(requestBytes);
		const parsed = JSON.parse(intentBytes.toString("utf8")) as ConversionEditIntentV1;
		const edit = parsed.edits[0]!;
		if (edit.kind !== "set-flow-briefing") throw new Error("fixture_edit_kind");
		const sourceBytes = documentBytes({ flow: { briefing: edit.briefing } });
		const provenance: PreparedConversionEditV1["provenance"] = {
			schemaVersion: 1,
			revision: captured.revision + 1,
			sha256: digest(sourceBytes),
			bytesBase64: sourceBytes.toString("base64"),
			derivedFrom: {
				revision: captured.revision,
				documentHash: captured.documentHash,
				sourceHash: "e".repeat(64),
			},
			intent: { requestId: parsed.requestId, sha256: digest(intentBytes), bytesBase64: intentBytes.toString("base64") },
		};
		const content = {
			engine: "langflow" as const,
			schemaVersion: 1 as const,
			componentManifestHash: manifestHash,
			graphDocument: { ...captured.graphDocument, fixturePrepared: provenance },
		};
		return {
			state: "prepared",
			intentBytes,
			base: {
				flowId,
				revision: captured.revision,
				documentHash: captured.documentHash,
				sourceBytesHash: digest(documentBytes(captured)),
			},
			enginePackageDigest: packageDigest,
			componentManifestHash: manifestHash,
			content,
			sourceBytes: documentBytes(content),
			metadata: { briefing: edit.briefing, harness: null },
			provenance,
		};
	};
	const services: ConversionEditServices = {
		prepare,
		installedIdentity: () => ({ enginePackageDigest: packageDigest, componentManifestHash: manifestHash }),
	};
	return { ...f, base, intent, services };
}
