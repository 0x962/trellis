import { z } from "zod";
import { documentBytes, type readExecutionPublication } from "../../flowDocuments";
import type { ConversionAssociationV1 } from "../conversionIntakeTypes";
import { readConversionSource } from "../readConversionSource";
import { sourceDigest } from "../sourceDigest";

export const readConversionBinding = (
	verified: Pick<ReturnType<typeof readExecutionPublication>, "publication" | "graphDocument">,
	visit: Pick<ConversionAssociationV1, "engineNodeId" | "phase" | "specNamespace">,
) => {
	const { envelope, source: document, originalSource } = readConversionSource(verified.graphDocument);
	const publication = verified.publication;
	if (publication.conversion?.sourceDocumentHash !== envelope.source.sha256 ||
		publication.flowId !== envelope.source.flowId ||
		publication.componentManifestHash !== envelope.componentManifestHash ||
		(envelope.editedSource && envelope.editedSource.revision > publication.revision)) {
		throw new Error("conversion_publication_conflict");
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
	return {
		binding, sourceNode: nodes[0]!, sourceFlow: document.flow,
		originalSourceNode: originalSource.nodes.find((node) => node.id === binding.sourceNodeId)!,
		originalSourceFlow: originalSource.flow,
	};
};
