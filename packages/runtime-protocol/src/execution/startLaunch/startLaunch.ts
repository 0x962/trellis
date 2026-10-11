import type { LaunchSpec, RuntimeSession } from "../../index.ts";
import type { ExecutionTarget } from "../ExecutionTarget";
import type { LaunchOutcome } from "../LaunchOutcome";
import { LaunchSpecMismatch } from "../LaunchSpecMismatch";
import { runLaunch } from "../runLaunch";

// Starts `spec` for `target` and names the outcome. `start` sends the
// request; it receives the full spec with the environment of the host. The
// id of the spec must equal the attempt id of the target.
export function startLaunch(
	start: (spec: LaunchSpec) => Promise<RuntimeSession>,
	target: ExecutionTarget,
	spec: LaunchSpec,
	descriptorDigest: () => Promise<string | null>,
): Promise<LaunchOutcome> {
	if (spec.id !== target.attemptId) throw new LaunchSpecMismatch(target.attemptId, spec.id);
	return runLaunch(target, () => start(spec), descriptorDigest);
}
