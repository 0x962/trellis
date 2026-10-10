import { fingerprintDigest, redactLaunchSpec } from "@trellis/runtime-protocol/execution";
import type { HarnessDescriptor } from "../../../../agents/harnessHost/types.ts";
import type { LocalDescriptor } from "../LocalExecutionHost.ts";

// The record without the environment of its spec and with the digest of its
// fingerprint. Every record that leaves the host through the contract passes
// through here.
export const redactDescriptor = ({ fingerprint, spec, ...descriptor }: HarnessDescriptor): LocalDescriptor => ({
	...descriptor,
	spec: redactLaunchSpec(spec),
	// The record of a custom launch has no fingerprint.
	fingerprintDigest: (fingerprint as string | undefined) === undefined ? null : fingerprintDigest(fingerprint),
});
