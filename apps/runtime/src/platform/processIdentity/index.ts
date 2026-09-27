import type { ProcessIdentityInspector } from "./types.ts";

const inspector: ProcessIdentityInspector = await (async () => {
	if (process.platform === "darwin") return import("./darwin.ts");
	if (process.platform === "linux") return import("./linuxNode.ts");
	throw new Error(`Process inspection does not support ${process.platform}`);
})();

export const inspectProcess = inspector.inspectProcess;
export const inspectProcessSession = inspector.inspectProcessSession;
export { linuxProcessIdentity, parseLinuxProcessStat } from "./linux.ts";
export type {
	LinuxProcessIdentity,
	LinuxProcessOperations,
	LinuxProcessStat,
} from "./linux.ts";
export type { ProcessIdentityInspector, ProcessObservation, ProcessSessionObservation } from "./types.ts";
