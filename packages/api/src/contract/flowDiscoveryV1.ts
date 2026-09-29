import { FlowListInputSchema } from "../schemas/flow.ts";
import { FlowDiscoveryV1Schema } from "../schemas/flowDiscoveryV1.ts";
import { base } from "./base.ts";

export const flowDiscoveryV1 = base
	.route({ method: "GET", path: "/flows/discovery-v1", summary: "Read compact flow summaries and capabilities" })
	.input(FlowListInputSchema)
	.output(FlowDiscoveryV1Schema);
