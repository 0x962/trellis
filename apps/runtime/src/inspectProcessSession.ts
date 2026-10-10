import { platform } from "./platform/index.ts";

export type { ProcessSessionObservation } from "./platform/index.ts";
export const inspectProcessSession = platform.inspectProcessSession;
