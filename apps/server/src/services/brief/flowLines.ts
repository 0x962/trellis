import { type FlowSummary, flowPurpose } from "@trellis/api";

export const flowLines = (flows: FlowSummary[]): string[] =>
	flows.length === 0
		? []
		: ["## Available flows", "", ...flows.map((flow) => `- ${flow.id}: ${flow.slug}, ${flowPurpose(flow)}`)];
