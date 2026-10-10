import { createHash } from "node:crypto";

// The sha256 hex digest of the fingerprint of a prepared launch record. The
// fingerprint on disk embeds the environment of the process, so only its
// digest leaves a host. Two digests are equal when the two fingerprints are
// equal, and a caller compares them for nothing else.
export const fingerprintDigest = (fingerprint: string) => createHash("sha256").update(fingerprint).digest("hex");
