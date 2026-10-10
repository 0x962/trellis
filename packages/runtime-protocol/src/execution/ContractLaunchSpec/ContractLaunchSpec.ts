import type { LaunchSpec } from "../../index.ts";
import type { AttemptEnvironment } from "../AttemptEnvironment";

// The launch a caller hands to an execution host. Its environment is the
// attempt environment and nothing else: the host adds its own login
// environment before the runtime starts the process.
export type ContractLaunchSpec = Omit<LaunchSpec, "env"> & { env?: AttemptEnvironment };
