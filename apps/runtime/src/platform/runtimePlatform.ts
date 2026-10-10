import type { LaunchSpec, RuntimeProcessMetadata } from "@trellis/runtime-protocol";

export type ProcessObservation =
	| { kind: "live"; process: RuntimeProcessMetadata }
	| { kind: "missing" }
	| { kind: "unknown"; error: string };

export type ProcessIdentity = Omit<RuntimeProcessMetadata, "executable">;

export type ProcessIdentityObservation =
	| { kind: "live"; process: ProcessIdentity }
	| { kind: "missing" }
	| { kind: "unknown"; error: string };

export type ProcessSessionObservation =
	| { kind: "empty" }
	| { kind: "live"; pids: number[] }
	| { kind: "unknown"; error: string };

export type ExitWatcher = {
	watch: (pid: number, listener: () => void) => void;
	close: () => void;
};

// One implementation for each supported host. `identity` is an opaque string
// that callers compare by equality. Two processes that receive the same PID
// have different identities.
export type RuntimePlatform = {
	inspectProcess: (pid: number) => ProcessObservation;
	processIdentity: (pid: number) => ProcessIdentityObservation;
	inspectProcessSession: (sessionId: number) => ProcessSessionObservation;
	// Answers -1 when no process has this PID.
	sessionOf: (pid: number) => number;
	attemptProcesses: (home: string, id: string) => ProcessIdentity[];
	createExitWatcher: () => ExitWatcher;
	// Throws when the host cannot contain and stop the process tree of a launch.
	prepareLaunch: (spec: LaunchSpec) => LaunchSpec;
	// Resolves only after no process of the launch with this session ID remains.
	stopProcessTree: (sessionId: number) => Promise<void>;
};
