import type { LaunchSpec } from "../../index.ts";

// The least a prepared launch record holds: the spec the runtime starts and
// the fingerprint of the request that produced it. A host refuses a second
// preparation of the same attempt with another fingerprint.
export type PreparedLaunch = { spec: LaunchSpec; fingerprint: string };
