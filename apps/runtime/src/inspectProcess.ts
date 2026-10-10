import { platform } from "./platform/index.ts";

export type { ProcessObservation } from "./platform/index.ts";
export const inspectProcess = platform.inspectProcess;
