import { isDeepStrictEqual } from "node:util";
import type { FlowDiagnosticV1, FlowDoc } from "@trellis/api";
import { z } from "zod";
import { catalogDiagnostics } from "../catalogDiagnostics";
import { compileFlow } from "../compileFlow";
import { compilerCatalog } from "../compilerCatalog";
import type {
	ConcreteConversionProducer,
	ConversionCompileResult,
	ConversionCompilerInput,
} from "../conversionCompilerTypes";
import type { ConversionEditProducer } from "../conversionEditTypes";
import { inspectSource } from "../inspectSource";
import { readConversionSource } from "../readConversionSource";

const error = (code: string, message: string, path: (string | number)[] = []): FlowDiagnosticV1 => ({
	code,
	message,
	severity: "error",
	path,
});

export const createConversionProducer = (
	value: ConversionCompilerInput,
	validate: ConversionEditProducer["validate"],
): ConcreteConversionProducer => {
	const input = structuredClone(value);
	const catalog = compilerCatalog(input);
	const compile = async ({ sourceBytes }: { sourceBytes: Uint8Array }): Promise<ConversionCompileResult> => {
		const source: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes));
		const inspected = inspectSource(source);
		if (inspected.manifest === null || inspected.diagnostics.length > 0)
			return { state: "blocked", diagnostics: inspected.diagnostics, candidate: null };
		const doc = source as FlowDoc;
		const diagnostics = catalogDiagnostics(input.catalogBytes, doc, catalog.catalog.engine.version);
		if (catalog.templates === null) {
			diagnostics.push(
				error(
					"conversion_frontend_templates_unavailable",
					"The verified package must supply complete engine templates.",
				),
			);
			return { state: "blocked", diagnostics, candidate: null };
		}
		const classes = new Set(catalog.templates.definitions.map((entry) => entry.className));
		let missing = false;
		for (const node of doc.nodes) {
			if (node.kind === "loop" && doc.edges.filter((edge) => edge.toNodeId === node.id).length > 1) {
				missing = true;
				diagnostics.push(
					error(
						"conversion_loop_multiple_inputs_unavailable",
						"The scalar loop seed cannot preserve multiple predecessor outputs.",
						["nodes", node.id],
					),
				);
			}
			if (node.kind === "loop" && !doc.edges.some((edge) => edge.toNodeId === node.id)) {
				const definition = catalog.templates.definitions.find((entry) => entry.className === "TrellisLoopV1");
				const fields = z.record(z.string(), z.json()).safeParse(definition?.frontendTemplate.data.node.template);
				const seed = z.object({ required: z.literal(false) }).safeParse(fields.data?.seed);
				if (!seed.success) {
					missing = true;
					diagnostics.push(
						error(
							"conversion_loop_seed_unqualified",
							"The installed loop definition must preserve an absent predecessor input.",
							["nodes", node.id],
						),
					);
				}
			}
			if (node.kind === "loop" && node.parentId !== null && !doc.edges.some((edge) => edge.toNodeId === node.id)) {
				const definition = catalog.templates.definitions.find((entry) => entry.className === "TrellisLoopV1");
				const fields = z.record(z.string(), z.json()).safeParse(definition?.frontendTemplate.data.node.template);
				if (
					!z
						.object({ required: z.literal(false), input_types: z.array(z.literal("Data")) })
						.safeParse(fields.data?.scope_entry).success
				) {
					missing = true;
					diagnostics.push(
						error(
							"conversion_loop_entry_scope_unavailable",
							"A nested entry loop needs a control dependency that preserves its empty predecessor input.",
							["nodes", node.id],
						),
					);
				}
			}
			if (node.kind === "gate" && node.reviewArea != null && node.parentId !== null) {
				missing = true;
				diagnostics.push(
					error(
						"conversion_group_settlement_unavailable",
						"The review gate has no common committed result port for group settlement.",
						["nodes", node.id],
					),
				);
			}
			const required =
				node.kind === "group"
					? ["TrellisGroupScopeV1", "TrellisGroupSettlementV1", "TrellisGroupOutputV1"]
					: node.kind === "loop"
						? [
								"TrellisLoopV1",
								"TrellisGroupScopeV1",
								"TrellisGroupSettlementV1",
								"TrellisGroupOutputV1",
								"TrellisNativeAgentV1",
							]
						: node.kind === "human"
							? ["TrellisHumanDecisionV1"]
							: node.kind === "gate"
								? node.reviewArea != null
									? ["TrellisReviewGateV1"]
									: ["TrellisNativeAgentV1", "TrellisNativeDecisionV1"]
								: ["TrellisNativeAgentV1"];
			for (const name of required)
				if (!classes.has(name)) {
					missing = true;
					diagnostics.push(
						error("conversion_definition_unavailable", `The verified package lacks the ${name} definition.`, [
							"nodes",
							node.id,
						]),
					);
				}
		}
		if (missing) return { state: "blocked", diagnostics, candidate: null };
		const generated = compileFlow(doc, input, catalog);
		diagnostics.push(...generated.diagnostics);
		if (generated.expansion === null) return { state: "blocked", diagnostics, candidate: null };
		return diagnostics.some((item) => item.severity === "error")
			? { state: "blocked", diagnostics, candidate: generated.expansion }
			: { state: "generated", expansion: generated.expansion };
	};
	return {
		enginePackageDigest: input.enginePackageDigest,
		componentManifestHash: input.componentManifestHash,
		catalogBytes: Buffer.from(input.catalogBytes),
		compile,
		regenerate: async ({ editedSourceBytes, previousGraphDocument }) => {
			const previous = readConversionSource(previousGraphDocument);
			const edited = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(editedSourceBytes)) as FlowDoc;
			if (
				edited.flow.id !== previous.source.flow.id ||
				edited.flow.version !== previous.source.flow.version ||
				!isDeepStrictEqual(
					edited.nodes.map((node) => [node.id, node.parentId, node.kind]),
					previous.source.nodes.map((node) => [node.id, node.parentId, node.kind]),
				) ||
				!isDeepStrictEqual(edited.edges, previous.source.edges)
			)
				return {
					state: "blocked",
					diagnostics: [
						error(
							"conversion_regeneration_source_conflict",
							"The edit must retain source identities, hierarchy, order, and edges.",
						),
					],
					candidate: null,
				};
			return compile({ sourceBytes: editedSourceBytes });
		},
		validate,
	};
};
