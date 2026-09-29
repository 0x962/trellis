import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	FlowDocumentGetV1InputSchema,
	FlowDocumentSaveV1InputSchema,
	FlowDocumentV1Schema,
	FlowUnsupportedFormatV1Schema,
} from "../schemas/flowDocumentV1.ts";
import { FlowExecutionGetInputSchema } from "../schemas/flowExecution.ts";
import {
	FlowExecutionIdentityV1Schema,
	FlowExecutionListV1InputSchema,
	FlowExecutionViewV1Schema,
} from "../schemas/flowExecutionViewV1.ts";
import { base } from "./base.ts";
import { flowEditorErrors } from "./flowEditorSessionV1.ts";

export const flowDocumentV1Errors = {
	FLOW_UNSUPPORTED_FORMAT: {
		status: 422,
		message: "This client cannot read or write this flow format without data loss.",
		data: FlowUnsupportedFormatV1Schema,
	},
	...pickErrors(["FLOW_VERSION_CONFLICT"]),
	FLOW_REQUEST_CONFLICT: {
		status: 409,
		message: "This request ID already identifies different save bytes.",
		data: z.strictObject({ requestId: z.uuid() }),
	},
};

export const flowExecutionIndexV1 = base
	.route({ method: "GET", path: "/flow-executions/index-v1", summary: "List execution identities from both engines" })
	.input(FlowExecutionListV1InputSchema)
	.output(z.array(FlowExecutionIdentityV1Schema));

export const flowDocumentsV1 = {
	get: base
		.route({
			method: "GET",
			path: "/flows/{flow}/document-v1",
			summary: "Read the saved flow document and publication state",
		})
		.errors({ FLOW_UNSUPPORTED_FORMAT: flowDocumentV1Errors.FLOW_UNSUPPORTED_FORMAT })
		.input(FlowDocumentGetV1InputSchema)
		.output(FlowDocumentV1Schema),
	save: base
		.route({
			method: "PUT",
			path: "/flows/{flow}/document-v1",
			summary: "Save a flow document with its expected version",
		})
		.errors({ ...flowDocumentV1Errors, ...flowEditorErrors })
		.input(FlowDocumentSaveV1InputSchema)
		.output(FlowDocumentV1Schema),
	view: base
		.route({
			method: "GET",
			path: "/flow-executions/{id}/view-v1",
			summary: "Read an immutable flow snapshot and execution progress",
		})
		.errors({ FLOW_UNSUPPORTED_FORMAT: flowDocumentV1Errors.FLOW_UNSUPPORTED_FORMAT })
		.input(FlowExecutionGetInputSchema)
		.output(FlowExecutionViewV1Schema),
};
