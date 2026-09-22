import type { FlowSummary } from "@trellis/api";

export const startFlowId = (flows: readonly Pick<FlowSummary, "id">[], selectedFlowId: string) =>
	selectedFlowId === "" ? (flows[0]?.id ?? "") : selectedFlowId;
