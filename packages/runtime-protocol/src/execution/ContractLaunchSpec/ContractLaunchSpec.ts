import type { LaunchSpec } from "../../index.ts";
import type { AttemptEnvironment } from "../AttemptEnvironment";

// The launch a caller hands to `launch.start`. Its environment is the attempt
// environment and nothing else: the host adds its own login environment
// under it before the runtime starts the process. The six attempt values are
// required, so a spec that came back from the host, which has no
// environment, is not a start input.
export type ContractLaunchSpec = Omit<LaunchSpec, "env"> & { env: AttemptEnvironment };
