import { ORPCError } from "@orpc/server";
import type { FlowDocumentSnapshotV1 } from "@trellis/api";
import { flowDocumentV1Errors } from "@trellis/api/contract";

export const unsupported = (document: FlowDocumentSnapshotV1, operation: "read" | "write") =>
	new ORPCError("FLOW_UNSUPPORTED_FORMAT", {
		status: flowDocumentV1Errors.FLOW_UNSUPPORTED_FORMAT.status,
		message: flowDocumentV1Errors.FLOW_UNSUPPORTED_FORMAT.message,
		defined: true,
		data: {
			flowId: document.flow.id,
			engine: document.engine,
			schemaVersion: document.schemaVersion,
			operation,
			supportedEndpoint: `/api/flows/${document.flow.id}/document-v1`,
			diagnostics: [
				{
					code: "flow_format_requires_versioned_document",
					message: "Use the versioned document endpoint to preserve this flow.",
					severity: "error",
					path: ["engine"],
				},
			],
		},
	});
