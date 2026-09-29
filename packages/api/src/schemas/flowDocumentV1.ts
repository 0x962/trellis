import { z } from "zod";
import {
	FlowEdgeInputSchema,
	FlowEdgeSchema,
	FlowNodeInputSchema,
	FlowNodeSchema,
	FlowRefSchema,
	FlowSchema,
} from "./flow.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

export const FlowDigestV1Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const FlowRevisionV1Schema = z.number().int().positive();
export const FlowEngineV1Schema = z.enum(["legacy", "langflow"]);
export type FlowEngineV1 = z.infer<typeof FlowEngineV1Schema>;
export const FlowDiagnosticV1Schema = z.strictObject({
	code: z.string().min(1),
	message: z.string().min(1),
	severity: z.enum(["error", "warning"]),
	path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
});

export type FlowDiagnosticV1 = z.infer<typeof FlowDiagnosticV1Schema>;

const content = {
	schemaVersion: z.literal(1),
};
const legacyContent = z.strictObject({
	...content,
	engine: z.literal("legacy"),
	graphDocument: z.strictObject({
		nodes: z.array(FlowNodeSchema),
		edges: z.array(FlowEdgeSchema),
	}),
	componentManifestHash: z.null(),
});
const langflowContent = z.strictObject({
	...content,
	engine: z.literal("langflow"),
	graphDocument: z
		.record(z.string(), z.json())
		.describe("Publication validates the graph against the pinned engine and component catalog."),
	componentManifestHash: FlowDigestV1Schema,
});
export const FlowDocumentContentV1Schema = z.discriminatedUnion("engine", [legacyContent, langflowContent]);
export type FlowDocumentContentV1 = z.infer<typeof FlowDocumentContentV1Schema>;

const snapshot = {
	flow: FlowSchema.strict().describe("The metadata belongs to this document revision."),
	revision: FlowRevisionV1Schema,
	documentHash: FlowDigestV1Schema,
	diagnostics: z.array(FlowDiagnosticV1Schema),
};
const legacySnapshot = legacyContent.extend(snapshot);
const langflowSnapshot = langflowContent.extend(snapshot);
export const FlowDocumentSnapshotV1Schema = z
	.discriminatedUnion("engine", [legacySnapshot, langflowSnapshot])
	.refine((value) => value.flow.version === value.revision, "The metadata version must match the document revision.");
export type FlowDocumentSnapshotV1 = z.infer<typeof FlowDocumentSnapshotV1Schema>;

export const FlowPublicationV1Schema = z.strictObject({
	publicationId: UlidSchema,
	flowId: UlidSchema,
	revision: FlowRevisionV1Schema,
	documentHash: FlowDigestV1Schema,
	engineFlowId: z.string().min(1),
	enginePackageDigest: FlowDigestV1Schema,
	componentManifestHash: FlowDigestV1Schema,
	publishedAt: IsoDateTimeSchema,
	conversion: z
		.strictObject({
			converterVersion: z.string().min(1),
			sourceDocumentHash: FlowDigestV1Schema,
		})
		.nullable(),
});
export type FlowPublicationV1 = z.infer<typeof FlowPublicationV1Schema>;

export const FlowPublicationStateV1Schema = z.discriminatedUnion("state", [
	z.strictObject({ state: z.literal("not_requested"), revision: FlowRevisionV1Schema }),
	z.strictObject({ state: z.literal("pending"), revision: FlowRevisionV1Schema }),
	z.strictObject({
		state: z.enum(["failed", "blocked"]),
		revision: FlowRevisionV1Schema,
		diagnostics: z.array(FlowDiagnosticV1Schema).min(1),
	}),
	z.strictObject({
		state: z.literal("published"),
		revision: FlowRevisionV1Schema,
		publication: FlowPublicationV1Schema,
	}),
]);

export type FlowPublicationStateV1 = z.infer<typeof FlowPublicationStateV1Schema>;

const documentState = {
	publication: FlowPublicationStateV1Schema,
	lastExecutablePublication: FlowPublicationV1Schema.nullable().describe(
		"An older publication remains readable. It does not authorize a new run.",
	),
};
export const FlowDocumentV1Schema = z
	.discriminatedUnion("engine", [legacySnapshot.extend(documentState), langflowSnapshot.extend(documentState)])
	.refine(
		(value) => value.flow.version === value.revision && value.publication.revision === value.revision,
		"The metadata and publication state must name the saved revision.",
	)
	.refine(
		(value) =>
			value.publication.state !== "published" ||
			(value.engine === "langflow" &&
				value.publication.publication.flowId === value.flow.id &&
				value.publication.publication.revision === value.revision &&
				value.publication.publication.documentHash === value.documentHash &&
				value.publication.publication.componentManifestHash === value.componentManifestHash),
		"The publication must identify the saved document.",
	)
	.refine(
		(value) =>
			value.lastExecutablePublication === null ||
			(value.engine === "langflow" &&
				value.lastExecutablePublication.flowId === value.flow.id &&
				value.lastExecutablePublication.revision <= value.revision),
		"The executable publication must belong to this flow and cannot follow the saved revision.",
	);
export type FlowDocumentV1 = z.infer<typeof FlowDocumentV1Schema>;

export const FlowDocumentGetV1InputSchema = z.strictObject({ flow: FlowRefSchema });
const save = {
	flow: FlowRefSchema,
	expectedVersion: FlowRevisionV1Schema,
	requestId: z.uuid().describe("Equal request bytes return the original save receipt. Changed bytes conflict."),
};
export const FlowDocumentSaveV1InputSchema = z.discriminatedUnion("engine", [
	legacyContent.extend({
		...save,
		graphDocument: z.strictObject({
			nodes: z.array(FlowNodeInputSchema),
			edges: z.array(FlowEdgeInputSchema),
		}),
	}),
	langflowContent.extend(save),
]);
export type FlowDocumentSaveV1Input = z.input<typeof FlowDocumentSaveV1InputSchema>;

export const FlowUnsupportedFormatV1Schema = z.strictObject({
	flowId: UlidSchema,
	engine: FlowEngineV1Schema,
	schemaVersion: z.number().int().positive(),
	operation: z.enum(["read", "write"]),
	supportedEndpoint: z.string().min(1),
	diagnostics: z.array(FlowDiagnosticV1Schema).min(1),
});
