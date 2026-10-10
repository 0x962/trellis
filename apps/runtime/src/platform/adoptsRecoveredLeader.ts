import type { ProcessIdentityObservation, ProcessObservation } from "./runtimePlatform.ts";

// A recovered leader keeps its launch unless it exited or another process now
// has its PID. An unknown observation can come from a live leader, such as one
// whose main thread exited while other threads run, so it keeps the launch.
export const adoptsRecoveredLeader = (
	leader: ProcessObservation | ProcessIdentityObservation,
	identity: string | null,
) => leader.kind === "unknown" || (leader.kind === "live" && leader.process.identity === identity);
