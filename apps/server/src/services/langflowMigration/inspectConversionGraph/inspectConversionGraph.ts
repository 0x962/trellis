import type { FlowDiagnosticV1, FlowDoc } from "@trellis/api";
import { z } from "zod";
import { documentBytes } from "../../flowDocuments";
import {
	ConversionExpansionSchema,
	type ConversionBindingV1,
	type ConversionEnvelopeV1,
} from "../conversionIntakeTypes";
import { inspectSource } from "../inspectSource";
import { sourceDigest } from "../sourceDigest";

const object = z.record(z.string(), z.json());
const vertices = z.array(z.object({ id: z.string(), data: z.object({ id: z.string(), type: z.string() }) }));
const catalogSchema = z.object({
	definitions: z.array(z.object({ id: z.string(), className: z.string() })),
});

export const inspectConversionGraph = (input: {
	sourceBytes: Uint8Array;
	catalogBytes: Uint8Array;
	expansion: unknown;
}) => {
	const source: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.sourceBytes));
	const inspection = inspectSource(source);
	const diagnostics: FlowDiagnosticV1[] = [...inspection.diagnostics];
	const parsed = ConversionExpansionSchema.safeParse(input.expansion);
	if (!parsed.success || inspection.manifest === null) {
		diagnostics.push({
			code: "conversion_intake_invalid",
			message: "The source or expansion cannot supply an immutable node association.",
			severity: "error",
			path: [],
		});
		return { graphDocument: null, diagnostics };
	}
	const expansion = parsed.data;
	const graph = expansion.graphDocument;
	const sourceDocument = source as FlowDoc;
	const catalog = catalogSchema.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.catalogBytes)));
	const graphNodes = vertices.safeParse(graph.nodes ?? object.safeParse(graph.data).data?.nodes);
	const fail = (code: string, path: (string | number)[], message: string) => {
		diagnostics.push({ code, path, message, severity: "error" });
	};
	if (!catalog.success || !graphNodes.success || Object.hasOwn(graph, "trellisConversionV1")) {
		fail("conversion_graph_invalid", [], "The catalog, graph vertices, or conversion namespace conflicts with the intake.");
		return { graphDocument: null, diagnostics };
	}
	const nodeSpecs: ConversionBindingV1[] = [];
	const used = new Set<string>();
	for (const [index, association] of expansion.nodeSpecs.entries()) {
		const path = ["nodeSpecs", index];
		const nodes = sourceDocument.nodes.filter((node) => node.id === association.sourceNodeId);
		const engineNodes = graphNodes.data.filter((node) => node.id === association.engineNodeId);
		const definitions = catalog.data.definitions.filter((definition) => definition.id === association.definitionId);
		if (nodes.length !== 1 || engineNodes.length !== 1 || definitions.length !== 1 || used.has(association.engineNodeId)) {
			fail("conversion_association_conflict", path, "The source node, engine vertex, and catalog definition must each identify one association.");
			continue;
		}
		used.add(association.engineNodeId);
		const node = nodes[0]!;
		const vertex = engineNodes[0]!;
		const specMap = object.safeParse(graph[association.specNamespace]);
		const spec = object.safeParse(specMap.data?.[association.engineNodeId]);
		if (vertex.data.id !== vertex.id || vertex.data.type !== definitions[0]!.className || !spec.success || spec.data.nodeId !== node.id) {
			fail("conversion_spec_conflict", path, "The saved vertex and static specification must identify the original source node and catalog class.");
			continue;
		}
		const isReview = association.specNamespace === "trellisReviewGatesV1";
		if (association.phase !== (node.kind === "loop" ? "condition" : "step") ||
			(isReview ? node.kind !== "gate" || node.reviewArea == null || spec.data.reviewArea !== node.reviewArea
				: node.kind === "group" || node.reviewArea != null)) {
			fail("conversion_role_conflict", path, "The specification namespace and phase do not match the source node behavior.");
			continue;
		}
		if (!isReview) {
			const sourceHarness = node.harness ?? sourceDocument.flow.harness;
			const harness = object.safeParse(spec.data.harness);
			const harnessMatches = node.kind === "human" ? spec.data.harness === null : harness.success &&
				typeof harness.data.startCommand === "string" && harness.data.startCommand.length > 0 &&
				typeof harness.data.resumeCommand === "string" && harness.data.resumeCommand.length > 0 &&
				(sourceHarness === null || Object.entries(sourceHarness).every(([key, value]) => harness.data[key] === value));
			if (spec.data.name !== node.title || !harnessMatches) {
				fail("conversion_configuration_conflict", path, "The specification changes the source title or inherited harness settings.");
				continue;
			}
			if (node.kind !== "human" && harness.success &&
				(harness.data.model === undefined || harness.data.effort === undefined)) {
				fail("conversion_harness_policy_unverified", path, "The publication owner must verify the immutable harness defaults and launch commands.");
			}
			if (typeof spec.data.instruction !== "string") {
				fail("conversion_instruction_invalid", path, "The producer must supply the exact static instruction text.");
				continue;
			}
			if (Object.hasOwn(spec.data, "accountId")) {
				fail("conversion_account_binding_unverified", path, "The legacy source has no account binding. The explicit producer binding requires verification.");
			}
		}
		nodeSpecs.push({
			...association,
			sourceNodeHash: sourceDigest(documentBytes(node)),
			specHash: sourceDigest(documentBytes(spec.data)),
		});
	}
	if (nodeSpecs.length !== expansion.nodeSpecs.length || inspection.diagnostics.length > 0) {
		return { graphDocument: null, diagnostics };
	}
	const envelope: ConversionEnvelopeV1 = {
		schemaVersion: 1,
		source: {
			flowId: sourceDocument.flow.id,
			version: sourceDocument.flow.version,
			sha256: sourceDigest(input.sourceBytes),
			bytesBase64: Buffer.from(input.sourceBytes).toString("base64"),
		},
		componentManifestHash: sourceDigest(input.catalogBytes),
		nodeSpecs,
	};
	fail("conversion_execution_unverified", [], "Executable mappings, static prompts, and engine traces require verification before publication.");
	return { graphDocument: { ...graph, trellisConversionV1: envelope }, diagnostics };
};
