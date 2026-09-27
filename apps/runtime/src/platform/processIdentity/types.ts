import type { RuntimeProcessMetadata } from "@trellis/runtime-protocol";

export type ProcessObservation =
	| { kind: "live"; process: RuntimeProcessMetadata }
	| { kind: "missing" }
	| { kind: "unknown"; error: string };

export type ProcessSessionObservation =
	| { kind: "empty" }
	| { kind: "live"; pids: number[] }
	| { kind: "unknown"; error: string };

export type ProcessInspector = {
	inspectProcess: (pid: number) => ProcessObservation;
	inspectProcessSession: (sessionId: number) => ProcessSessionObservation;
};
