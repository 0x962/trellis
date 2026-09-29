import type { FlowDiagnosticV1, FlowDoc } from "@trellis/api";
import { z } from "zod";

const SelectorSchema = z.strictObject({
	kind: z.enum(["agent", "gate", "human", "group", "loop"]),
	parallel: z.boolean().optional(),
	reviewArea: z
		.union([
			z.strictObject({ absentOrNull: z.literal(true) }),
			z.strictObject({ oneOf: z.array(z.enum(["frontend", "backend"])) }),
		])
		.optional(),
});
const CatalogSchema = z.object({
	schemaVersion: z.literal(1),
	catalogId: z.string(),
	engine: z.object({ name: z.literal("langflow"), version: z.string(), commit: z.string() }),
	allowedForPublication: z.boolean(),
	legacyMappings: z.array(
		z.object({
			id: z.string(),
			selector: SelectorSchema,
			status: z.string(),
			blockerCodes: z.array(z.string()),
		}),
	),
	blockers: z.record(z.string(), z.string()),
	preservation: z.object({
		fields: z.object({
			flow: z.array(z.string()),
			nodes: z.array(z.string()),
			edges: z.array(z.string()),
			harness: z.array(z.string()),
		}),
		fieldDestinations: z.object({
			flow: z.record(z.string(), z.string()),
			nodes: z.record(z.string(), z.string()),
			edges: z.record(z.string(), z.string()),
		}),
		harnessDestinations: z.array(z.string()),
	}),
});

const error = (code: string, message: string, path: (string | number)[]): FlowDiagnosticV1 => ({
	code,
	message,
	path,
	severity: "error",
});

export const catalogDiagnostics = (
	bytes: Uint8Array,
	doc: FlowDoc | null,
	engineVersion: string,
): FlowDiagnosticV1[] => {
	const parsed = CatalogSchema.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
	if (!parsed.success)
		return [error("unsupported_catalog", "The catalog does not match the supported report format.", ["catalog"])];
	const catalog = parsed.data;
	const diagnostics = [
		error(
			"executable_conversion_unavailable",
			"Executable conversion and integrated traces remain required. Publication is blocked.",
			["catalog"],
		),
	];
	if (catalog.engine.version !== engineVersion)
		diagnostics.push(
			error("catalog_engine_mismatch", "The catalog engine version differs from the requested target.", [
				"catalog",
				"engine",
			]),
		);
	if (!doc) return diagnostics;
	for (const node of doc.nodes) {
		const mappings = catalog.legacyMappings.filter(({ selector }) => {
			if (selector.kind !== node.kind || (selector.parallel !== undefined && selector.parallel !== node.parallel))
				return false;
			if (!selector.reviewArea) return true;
			return "absentOrNull" in selector.reviewArea
				? node.reviewArea == null
				: node.reviewArea != null && selector.reviewArea.oneOf.includes(node.reviewArea);
		});
		if (mappings.length !== 1) {
			diagnostics.push(
				error("catalog_selector_unresolved", "The source node needs exactly one catalog mapping.", ["nodes", node.id]),
			);
			continue;
		}
		for (const code of mappings[0]!.blockerCodes) {
			const message = catalog.blockers[code];
			diagnostics.push(
				message === undefined
					? error("catalog_blocker_undefined", "The catalog references a blocker without a description.", [
							"nodes",
							node.id,
						])
					: error(code, message, ["nodes", node.id]),
			);
		}
		if (mappings[0]!.status !== "blocked")
			diagnostics.push(
				error("catalog_mapping_unimplemented", "The converter does not implement this catalog mapping.", [
					"nodes",
					node.id,
				]),
			);
	}
	const scopes = { flow: [doc.flow], nodes: doc.nodes, edges: doc.edges };
	for (const scope of ["flow", "nodes", "edges"] as const) {
		for (const row of scopes[scope]) {
			for (const field of Object.keys(row)) {
				if (
					!catalog.preservation.fields[scope].includes(field) ||
					!catalog.preservation.fieldDestinations[scope][field]
				) {
					diagnostics.push(
						error("catalog_field_unmapped", "The catalog does not declare a destination for this source field.", [
							scope,
							row.id,
							field,
						]),
					);
				}
			}
			if ("harness" in row && row.harness !== null) {
				for (const field of Object.keys(row.harness)) {
					const destination = scope === "flow" ? "/trellisSource/flow/harness" : "/trellisSource/nodes/INDEX/harness";
					if (
						!catalog.preservation.fields.harness.includes(field) ||
						!catalog.preservation.harnessDestinations.includes(destination)
					) {
						diagnostics.push(
							error("catalog_field_unmapped", "The catalog does not declare a destination for this harness field.", [
								scope,
								row.id,
								"harness",
								field,
							]),
						);
					}
				}
			}
		}
	}
	return diagnostics;
};
