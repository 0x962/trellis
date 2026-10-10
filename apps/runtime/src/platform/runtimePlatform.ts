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

// `spec` is the command that the runtime spawns. `started` receives the PID of
// the spawned process before any stop of that launch.
export type PreparedLaunch = {
	spec: LaunchSpec;
	started: (pid: number) => void;
};

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
	prepareLaunch: (spec: LaunchSpec) => PreparedLaunch;
	// Resolves only after no process of the launch with this session ID remains.
	// The session ID can also belong to a descendant that started its own
	// session; the stop then covers the launch that contains it.
	stopProcessTree: (sessionId: number) => Promise<void>;
};
