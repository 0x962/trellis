import { createHash } from "node:crypto";
import type { Flow, FlowDocumentSnapshotV1 } from "@trellis/api";
import type { Tx } from "../../../db/tx.ts";
import { readDoc } from "../../flows/flows.ts";
import { documentBytes } from "../documentBytes";

export const legacySnapshot = async (tx: Tx, flow: Flow): Promise<FlowDocumentSnapshotV1> => {
	const { nodes, edges } = await readDoc(tx, flow);
	const content = {
		schemaVersion: 1 as const,
		engine: "legacy" as const,
		graphDocument: { nodes, edges },
		componentManifestHash: null,
	};
	return {
		...content,
		flow,
		revision: flow.version,
		documentHash: createHash("sha256").update(documentBytes(content)).digest("hex"),
		diagnostics: [],
	};
};
