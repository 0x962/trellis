import type { LaunchSpec } from "../../index.ts";

// The least a prepared launch record holds when it leaves a host: the spec
// the runtime starts, without its environment, and the sha256 hex digest of
// the fingerprint of the request that produced it, or null for a record
// without a fingerprint, which is a custom launch. A host refuses a second
// preparation of the same attempt with another fingerprint. The full record
// and the fingerprint stay on the host; a caller compares two digests for
// equality only.
export type PreparedLaunch = { spec: Omit<LaunchSpec, "env">; fingerprintDigest: string | null };
