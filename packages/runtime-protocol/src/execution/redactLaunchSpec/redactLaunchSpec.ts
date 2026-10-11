import type { LaunchSpec } from "../../index.ts";

// The spec without its environment. Every spec that leaves a host through
// the contract passes through here, so the login environment of the host
// stays on the host.
export const redactLaunchSpec = ({ env: _env, ...spec }: LaunchSpec): Omit<LaunchSpec, "env"> => spec;
