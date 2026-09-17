import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";

export type ManagerCtx = { now: Date };
export type ManagerInput = { sessions: RuntimeProcessStatus[] };
