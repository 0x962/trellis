import { FlowDocumentV1Schema, FlowExecutionViewV1Schema } from "@trellis/api";

export const readV1 = {
	document: (value: unknown) => FlowDocumentV1Schema.parse(value),
	execution: (value: unknown) => FlowExecutionViewV1Schema.parse(value),
};
