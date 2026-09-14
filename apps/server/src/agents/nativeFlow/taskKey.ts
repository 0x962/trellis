import type { FlowStep } from "./types.ts";
export const taskKey = (step: FlowStep) => `${step.key}:${step.phase}:${step.round}`;
