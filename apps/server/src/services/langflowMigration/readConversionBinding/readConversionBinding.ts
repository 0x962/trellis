import type { FlowDoc } from "@trellis/api";
import { z } from "zod";
import { documentBytes, type readExecutionPublication } from "../../flowDocuments";
import { type ConversionAssociationV1, ConversionEnvelopeSchema } from "../conversionIntakeTypes";
import { inspectSource } from "../inspectSource";
import { sourceDigest } from "../sourceDigest";

export const readConversionBinding = (
	verified: Pick<ReturnType<typeof readExecutionPublication>, "publication" | "graphDocument">,
	visit: Pick<ConversionAssociationV1, "engineNodeId" | "phase" | "specNamespace">,
) => {
	const envelope = ConversionEnvelopeSchema.parse(verified.graphDocument.trellisConversionV1);
	const publication = verified.publication;
	const sourceBytes = Buffer.from(envelope.source.bytesBase64, "base64");
	if (sourceBytes.toString("base64") !== envelope.source.bytesBase64 ||
		sourceDigest(sourceBytes) !== envelope.source.sha256 ||
		publication.conversion?.sourceDocumentHash !== envelope.source.sha256 ||
		publication.flowId !== envelope.source.flowId ||
		publication.componentManifestHash !== envelope.componentManifestHash) {
		throw new Error("conversion_publication_conflict");
	}
	const source: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes));
	const inspection = inspectSource(source);
	if (inspection.manifest === null || inspection.diagnostics.length > 0) throw new Error("conversion_source_invalid");
	const document = source as FlowDoc;
	if (document.flow.id !== envelope.source.flowId || document.flow.version !== envelope.source.version) {
		throw new Error("conversion_source_identity_conflict");
	}
	const bindings = envelope.nodeSpecs.filter((binding) => binding.engineNodeId === visit.engineNodeId);
	if (bindings.length !== 1) throw new Error("conversion_binding_ambiguous");
	const binding = bindings[0]!;
	if (binding.phase !== visit.phase || binding.specNamespace !== visit.specNamespace) {
		throw new Error("conversion_visit_conflict");
	}
	const object = z.record(z.string(), z.json());
	const graphNodes = z.array(z.object({ id: z.string(), data: z.object({ id: z.string() }) })).parse(
		verified.graphDocument.nodes ?? object.safeParse(verified.graphDocument.data).data?.nodes,
	);
	const vertices = graphNodes.filter((node) => node.id === binding.engineNodeId);
	if (vertices.length !== 1 || vertices[0]!.data.id !== binding.engineNodeId) {
		throw new Error("conversion_vertex_conflict");
	}
	const nodes = document.nodes.filter((node) => node.id === binding.sourceNodeId);
	if (nodes.length !== 1 || sourceDigest(documentBytes(nodes[0])) !== binding.sourceNodeHash) {
		throw new Error("conversion_node_conflict");
	}
	const specMap = object.parse(verified.graphDocument[binding.specNamespace]);
	const spec = object.parse(specMap[binding.engineNodeId]);
	if (spec.nodeId !== binding.sourceNodeId || sourceDigest(documentBytes(spec)) !== binding.specHash) {
		throw new Error("conversion_spec_hash_conflict");
	}
	return { binding, sourceNode: nodes[0]!, sourceFlow: document.flow };
};
