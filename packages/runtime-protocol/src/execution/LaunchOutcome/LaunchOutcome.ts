import type { RuntimeSession } from "../../index.ts";
import type { ExecutionTarget } from "../ExecutionTarget";

// The runtime accepted the launch. `session` is the runtime answer verbatim.
// The runtime echoes only the command, the arguments and the directory of a
// launch, so a receipt never holds the launch environment.
// `descriptorFingerprint` is the fingerprint of the prepared launch record
// of the attempt, and null for a custom launch, whose record has none.
export type LaunchReceipt = {
	kind: "receipt";
	target: ExecutionTarget;
	session: RuntimeSession;
	descriptorFingerprint: string | null;
};
// The request reached the socket and no answer came back, so the runtime may
// or may not hold the session. A caller reads the state with
// `observe.inspect`. A repeated `launch.start` with the same spec is safe:
// the runtime returns the existing session for an equal spec and throws
// LAUNCH_CONFLICT for a different one.
export type LaunchUnknown = {
	kind: "unknown";
	target: ExecutionTarget;
	reason: "timeout" | "connection-closed";
	message: string;
};
export type LaunchOutcome = LaunchReceipt | LaunchUnknown;
