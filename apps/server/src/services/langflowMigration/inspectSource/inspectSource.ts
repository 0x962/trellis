import {
	entryNodes,
	type FlowDiagnosticV1,
	FlowDocSchema,
	FlowEdgeSchema,
	FlowNodeSchema,
	FlowSchema,
	validateFlowGraph,
} from "@trellis/api";
import { z } from "zod";
import { documentBytes } from "../../flowDocuments/documentBytes";
import { sourceDigest } from "../sourceDigest";
import type { SourceInspection, SourceRowManifest } from "../types";

const SourceSchema = FlowDocSchema.extend({
	flow: FlowSchema.strict(),
	nodes: z.array(FlowNodeSchema.strict()),
	edges: z.array(FlowEdgeSchema.strict()),
}).strict();

const rowManifest = (row: { id: string }, order: number): SourceRowManifest => ({
	id: row.id,
	order,
	sha256: sourceDigest(documentBytes(row)),
	fields: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, sourceDigest(documentBytes(value))])),
});

export const inspectSource = (source: unknown): SourceInspection => {
	const parsed = SourceSchema.safeParse(source);
	if (!parsed.success) {
		return {
			manifest: null,
			diagnostics: parsed.error.issues.flatMap((issue): FlowDiagnosticV1[] => {
				const path = issue.path.map((part) => (typeof part === "number" ? part : String(part)));
				if (issue.code === "unrecognized_keys") {
					return issue.keys.map((key) => ({
						code: "unsupported_source_field",
						message: "The converter cannot map this source field. The export retains its original bytes.",
						severity: "error",
						path: [...path, key],
					}));
				}
				return [
					{
						code: "unsupported_source_value",
						message: "The source value does not match the supported legacy document format.",
						severity: "error",
						path,
					},
				];
			}),
		};
	}
	const doc = parsed.data;
	const diagnostics: FlowDiagnosticV1[] = validateFlowGraph(doc, "save").map((issue) => ({
		code: `source_${issue.code}`,
		message: issue.message,
		severity: "error",
		path: issue.nodeId ? ["nodes", issue.nodeId] : issue.edgeId ? ["edges", issue.edgeId] : [],
	}));
	return {
		manifest: {
			flow: rowManifest(doc.flow, 0),
			briefingHash: sourceDigest(doc.flow.briefing),
			nodes: doc.nodes.map(rowManifest),
			edges: doc.edges.map(rowManifest),
			instructionHashes: Object.fromEntries(doc.nodes.map((node) => [node.id, sourceDigest(node.instruction)])),
			entryNodeIds: entryNodes(doc, null),
		},
		diagnostics,
	};
};
