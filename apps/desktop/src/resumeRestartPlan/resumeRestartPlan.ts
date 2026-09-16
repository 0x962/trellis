import { readRestartPlan } from "@trellis/runtime-protocol/restart-plan";
import type { HostConnection } from "../host/host.ts";
import { hostError } from "../hostError/hostError.ts";

// The host resumes the agents in the background. `wait` holds this call until
// every agent of the plan has an outcome; a package update waits, a boot does not.
// A waited call fails when the host leaves an agent unrestored, so Restart
// reports the failure instead of leaving that agent stopped. A boot reads no
// outcome because its agents still resume in the background.
export const resumeRestartPlan = async (home: string, host: HostConnection, wait = false) => {
	const plan = await readRestartPlan(home);
	if (!plan) return;
	const response = await fetch(`${host.origin}/api/native-work/restart/resume`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${host.token}`,
			"content-type": "application/json",
			"x-trellis-actor": "human:desktop",
		},
		body: JSON.stringify({ restartId: plan.id, wait }),
	});
	if (!response.ok) throw await hostError(response);
	if (!wait) return;
	const outcome = (await response.json()) as { failed?: number };
	const failed = outcome.failed ?? 0;
	if (failed > 0)
		throw new Error(
			`The restart left ${failed} agent${failed === 1 ? "" : "s"} unrestored. Inspect the restart status for the reason, then retry the restart.`,
		);
};
