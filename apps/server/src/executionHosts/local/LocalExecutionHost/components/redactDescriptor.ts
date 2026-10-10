import { redactLaunchSpec } from "@trellis/runtime-protocol/execution";
import type { HarnessDescriptor } from "../../../../agents/harnessHost/types.ts";
import type { LocalDescriptor } from "../LocalExecutionHost.ts";

// The record without the environment of its spec. Every record that leaves
// the host through the contract passes through here.
export const redactDescriptor = (descriptor: HarnessDescriptor): LocalDescriptor => ({
	...descriptor,
	spec: redactLaunchSpec(descriptor.spec),
});
