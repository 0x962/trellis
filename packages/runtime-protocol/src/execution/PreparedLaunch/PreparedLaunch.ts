import type { LaunchSpec } from "../../index.ts";

// The least a prepared launch record holds when it leaves a host: the spec
// the runtime starts, without its environment, and the fingerprint of the
// request that produced it. A host refuses a second preparation of the same
// attempt with another fingerprint. The full record stays on the host.
export type PreparedLaunch = { spec: Omit<LaunchSpec, "env">; fingerprint: string };
