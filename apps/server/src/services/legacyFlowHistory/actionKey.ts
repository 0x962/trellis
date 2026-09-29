import type { FlowExecutionRecord } from "@trellis/api";

type Step = Pick<FlowExecutionRecord["state"]["steps"][number], "key" | "phase" | "round">;

// flow_execution_tasks.key stores the occurrence key, phase, and round in this order.
export const actionKey = (step: Step) => `${step.key}:${step.phase}:${step.round}`;
