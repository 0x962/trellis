import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	FlowCreateInputSchema,
	FlowDeleteInputSchema,
	FlowDeleteOutputSchema,
	FlowDocSchema,
	FlowGetInputSchema,
	FlowListInputSchema,
	FlowSaveInputSchema,
	FlowSchema,
	FlowSummarySchema,
	FlowUpdateInputSchema,
} from "../schemas/flow.ts";
import { base } from "./base.ts";
import { flowDocumentV1Errors } from "./flowDocumentsV1.ts";

// `{flow}` is the ULID or the slug of a flow.
export const flows = {
	list: base
		.route({ method: "GET", path: "/flows", summary: "List flows, or the flows a ticket's project asks for" })
		.input(FlowListInputSchema)
		.output(z.array(FlowSummarySchema)),
	get: base
		.route({ method: "GET", path: "/flows/{flow}", summary: "Read a flow with its nodes and edges" })
		.errors({ FLOW_UNSUPPORTED_FORMAT: flowDocumentV1Errors.FLOW_UNSUPPORTED_FORMAT })
		.input(FlowGetInputSchema)
		.output(FlowDocSchema),
	create: base
		.route({ method: "POST", path: "/flows", successStatus: 201, summary: "Create an empty flow" })
		.errors(pickErrors(["DUPLICATE"]))
		.input(FlowCreateInputSchema)
		.output(FlowSchema),
	update: base
		.route({
			method: "PATCH",
			path: "/flows/{flow}",
			summary: "Update the project, name, slug, description, or briefing",
		})
		.errors({
			...pickErrors(["DUPLICATE", "FLOW_VERSION_CONFLICT"]),
			FLOW_UNSUPPORTED_FORMAT: flowDocumentV1Errors.FLOW_UNSUPPORTED_FORMAT,
		})
		.input(FlowUpdateInputSchema)
		.output(FlowSchema),
	save: base
		.route({ method: "PUT", path: "/flows/{flow}/graph", summary: "Replace every node and edge of a flow" })
		.errors({
			...pickErrors(["DUPLICATE", "FLOW_VERSION_CONFLICT"]),
			FLOW_UNSUPPORTED_FORMAT: flowDocumentV1Errors.FLOW_UNSUPPORTED_FORMAT,
		})
		.input(FlowSaveInputSchema)
		.output(FlowDocSchema),
	delete: base
		.route({ method: "DELETE", path: "/flows/{flow}", summary: "Delete a flow with its nodes and edges" })
		.input(FlowDeleteInputSchema)
		.output(FlowDeleteOutputSchema),
};
