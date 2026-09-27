import type { ProcessInspector } from "./types.ts";

const inspector: ProcessInspector = await (async () => {
	if (process.platform === "darwin") return import("./darwin.ts");
	if (process.platform === "linux") return import("./linuxNode.ts");
	throw new Error(`Process inspection does not support ${process.platform}`);
})();

export const inspectProcess = inspector.inspectProcess;
export const inspectProcessSession = inspector.inspectProcessSession;
export type { ProcessObservation, ProcessSessionObservation } from "./types.ts";
