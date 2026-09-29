import { FlowDocumentV1Schema, FlowExecutionViewV1Schema } from "@trellis/api";
import { CliFailure } from "../../../errors.ts";

export const readV1 = {
	document: (value: unknown) => {
		const parsed = FlowDocumentV1Schema.safeParse(value);
		if (!parsed.success)
			throw new CliFailure("FLOW_UNSUPPORTED_FORMAT", 4, "The flow document does not match format version 1.");
		return parsed.data;
	},
	execution: (value: unknown) => {
		const parsed = FlowExecutionViewV1Schema.safeParse(value);
		if (!parsed.success)
			throw new CliFailure("FLOW_UNSUPPORTED_FORMAT", 4, "The flow execution does not match format version 1.");
		return parsed.data;
	},
};
